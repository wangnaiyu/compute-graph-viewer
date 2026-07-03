/* ① 模型效果时间轴：train/val loss + eval MMLU。框选→interestWindow，监听 stepCursor 画游标。 */
window.TimelineView = (function () {
  let ctrl = null;
  const emptyController = {
    setCursor() {},
    setInterestWindow() {},
  };

  function showTimelineError(host, error) {
    const message = error && error.message ? error.message : String(error || 'unknown error');
    console.error('[TrainScope] timeline render failed:', error);
    host.innerHTML = `<div class="timeline-load-error">${message}</div>`;
    ctrl = emptyController;
  }

  function init(host) {
    const ts = window.TS_DATA;
    const initialStep = ts.defaultStep || ts.collapseStep || ts.faultStep;
    const renderer = window.PtoTrainingMetricsChart;
    if (!renderer || typeof renderer.render !== 'function') {
      showTimelineError(host, new Error('training-metrics-chart pattern is not loaded'));
    } else {
      try {
        ctrl = renderer.render(host, {
          steps: ts.steps,
          series: [
            { id: 'train_loss', label: 'train loss', key: 'train_loss', colorVar: '--highlight-copy-blue-source', axis: 'left' },
            { id: 'val_loss', label: 'val loss', key: 'val_loss', colorVar: '--highlight-l0a-violet-source', axis: 'left', emphasis: true },
            { id: 'eval_mmlu', label: 'eval MMLU', key: 'eval_mmlu', colorVar: '--highlight-ub-green-source', axis: 'right' },
          ],
          data: ts.series,
          anomalies: ts.anomalies.val_loss,
          cursor: initialStep,
          options: { width: 1040, height: 160 },
          onBrush: (w) => Bus.emit('interestWindow', w),
          tooltip: (step) => {
            if (step < ts.faultStep) return 'train/val 平稳下降、eval 缓升——健康区。';
            if (step === ts.faultStep) return `混合精度权重更新内存 stride 算错 → 写越界（根因）。`;
            if (step <= ts.collapseStep + 1) return `Step ${ts.collapseStep} 路由坍缩起点：val loss 开始爆炸、eval 跳水。`;
            return 'val loss 高频振荡、eval 持续下滑——路由坍缩后的崩溃区。';
          },
        }) || emptyController;
      } catch (error) {
        showTimelineError(host, error);
      }
    }
    Bus.on('stepCursor', s => ctrl.setCursor(s));
    Bus.on('interestWindow', w => ctrl.setInterestWindow(w));
  }
  return { init };
})();
