// routes/groups.js — PHASE 2: group tasks.
//
// One person creates a group and adds members (by email — they must have
// accounts). Tasks are assigned to members. Reminders nag ONLY the members
// whose tasks are still open; each member's proof clears only their own task.
// Everyone sees the progress board: who is done, who is pending.
const express = require('express');
const supabase = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

// POST /api/groups {name, member_emails[]}
router.post('/', requireAuth, async (req, res) => {
  const { name, member_emails } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data: group, error } = await supabase.from('groups')
    .insert({ owner_id: req.user.id, name }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  const members = [{ group_id: group.id, user_id: req.user.id }];
  for (const email of member_emails || []) {
    const { data: u } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (u) members.push({ group_id: group.id, user_id: u.id });
  }
  await supabase.from('group_members').insert(members);
  res.status(201).json(group);
});

// GET /api/groups — groups I'm in.
router.get('/', requireAuth, async (req, res) => {
  const { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', req.user.id);
  const ids = (memberships || []).map((m) => m.group_id);
  if (!ids.length) return res.json([]);
  const { data } = await supabase.from('groups').select('*, group_members(user_id), group_tasks(*)').in('id', ids);
  res.json(data || []);
});

// POST /api/groups/:id/tasks {title, assignee_email?, due_at?}
router.post('/:id/tasks', requireAuth, async (req, res) => {
  const { title, assignee_email, due_at } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  let assignee_id = null;
  if (assignee_email) {
    const { data: u } = await supabase.from('users').select('id').eq('email', assignee_email).maybeSingle();
    assignee_id = u?.id || null;
  }
  const { data, error } = await supabase.from('group_tasks').insert({
    group_id: req.params.id, assignee_id, title, due_at: due_at || null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Mirror as a personal nag reminder for the assignee so the normal
  // 5-minute loop + proof flow applies to them automatically.
  if (assignee_id) {
    await supabase.from('reminders').insert({
      user_id: assignee_id, type: 'nag', title: `[Group] ${title}`,
      details: `Group task, due ${due_at || '—'}`,
      due_at: due_at || new Date().toISOString(),
    });
  }
  res.status(201).json(data);
});

// PATCH /api/groups/tasks/:taskId — update a group task.
// {title?, due_at?, assignee_email?, status?} — anyone in the group can edit;
// only the assignee (or owner) can mark done.
router.patch('/tasks/:taskId', requireAuth, async (req, res) => {
  const { title, due_at, assignee_email, status } = req.body || {};
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (due_at !== undefined) patch.due_at = due_at;
  if (status !== undefined) patch.status = status;
  if (assignee_email !== undefined) {
    if (assignee_email) {
      const { data: u } = await supabase.from('users').select('id').eq('email', assignee_email).maybeSingle();
      patch.assignee_id = u?.id || null;
    } else patch.assignee_id = null;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  const { data, error } = await supabase.from('group_tasks').update(patch)
    .eq('id', req.params.taskId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// DELETE /api/groups/tasks/:taskId
router.delete('/tasks/:taskId', requireAuth, async (req, res) => {
  const { error } = await supabase.from('group_tasks').delete().eq('id', req.params.taskId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/groups/tasks/:taskId/done — mark MY task done (proof via normal flow).
router.post('/tasks/:taskId/done', requireAuth, async (req, res) => {
  const { error } = await supabase.from('group_tasks').update({ status: 'done' })
    .eq('id', req.params.taskId).eq('assignee_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
