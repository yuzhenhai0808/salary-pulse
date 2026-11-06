(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const checks = [];
  try {
    const initial = await invoke('get_settings');
    checks.push(initial.config.rules.length === 0);
    const payload = {
      expectedRevision: initial.config.revision,
      salary: { mode: 'monthly', amount: '10000.00', currency: 'CNY', divisorDays: '21.75', standardPaidMinutes: 480, calculationBasis: 'calendar' },
      schedule: { timezone: 'Asia/Shanghai', workWeekdays: [1,2,3,4,5,6,7], shiftStart: '00:00', shiftEnd: '23:59', endDayOffset: 0, breaks: [], exceptions: [] },
      preferences: initial.config.preferences,
      startFromShift: true
    };
    const preview = await invoke('preview_salary', {input: {salary: payload.salary, schedule: payload.schedule}});
    checks.push(preview.monthlyAmount === '10000.00' && preview.workingDays > 0 && preview.paidMinutesPerShift === 1439);
    const saved = await invoke('save_settings', { payload });
    checks.push(saved.config.rules[0].salary.standardPaidMinutes === 1439);
    checks.push(saved.config.rules.length === 1);
    const before = await invoke('get_snapshot');
    checks.push(before.status === 'WORKING' && before.estimatedTodayAmount !== null);
    const locale = await invoke('set_language', {language:'en-US', expectedRevision:saved.config.revision});
    checks.push(locale.effectiveLocale === 'en-US');
    const after = await invoke('get_snapshot');
    checks.push(after.currency === before.currency && after.shiftId === before.shiftId);
    await invoke('set_privacy', {hidden:true});
    const hidden = await invoke('get_snapshot');
    checks.push(hidden.estimatedTodayAmount === null && hidden.estimatedShiftAmount === null);
    await invoke('report_smoke', {report:{ok:checks.every(Boolean),checks,locale:locale.effectiveLocale,status:before.status}});
  } catch (error) {
    await invoke('report_smoke', {report:{ok:false,checks,error:String(error)}});
  }
})();
