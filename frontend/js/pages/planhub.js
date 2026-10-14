/* One calm planning home with focused Calendar, Reminders, and Study plan views. */
const PlanHub = {
  initialized: new Set(),
  valid: ['calendar', 'reminders', 'planner', 'tasks'],
  show(view, updateUrl = true) {
    if (!this.valid.includes(view)) view = 'calendar';
    document.querySelectorAll('#planHub [data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('on', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('#planHub .planPane').forEach((panel) => { panel.hidden = panel.id !== `page-${view}`; });
    if (updateUrl && location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
    if (!this.initialized.has(view)) {
      this.initialized.add(view);
      if (view === 'calendar') initCalendar();
      if (view === 'reminders') initReminders();
      if (view === 'planner') initPlanner();
      if (view === 'tasks') initTasks();
    }
  },
  init() {
    document.querySelectorAll('#planHub [data-view]').forEach((button, index, buttons) => {
      button.onclick = () => this.show(button.dataset.view);
      button.onkeydown = (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const next = (index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
        buttons[next].focus(); buttons[next].click();
      };
    });
    this.show(location.hash.slice(1), false);
  },
};

document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('planHub')) PlanHub.init(); });
