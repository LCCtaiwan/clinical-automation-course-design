const CONTINUATION_HANDLER = 'continueNewsletterPipeline';

function continueNewsletterPipeline() {
  return continueNewsletterTranslationPipeline_();
}

function scheduleContinuation_() {
  removeContinuationTriggers_();

  ScriptApp
    .newTrigger(CONTINUATION_HANDLER)
    .timeBased()
    .after(CONFIG.continuationDelayMinutes * 60 * 1000)
    .create();
}

function removeContinuationTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === CONTINUATION_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function installWeeklyNewsletterTrigger() {
  removeWeeklyNewsletterTriggers();

  ScriptApp
    .newTrigger('runNewsletterPipeline')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  return '已安裝每週一 08:00 固定執行';
}

function removeWeeklyNewsletterTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'runNewsletterPipeline') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  return '已移除每週固定執行';
}
