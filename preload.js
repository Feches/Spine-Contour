const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('spineContour', {
  calibrate: (request) => ipcRenderer.invoke('calibrate', request),
  saveCalibration: (reference) => ipcRenderer.invoke('save-calibration', reference),
  learnCalibrationProfile: (request) => ipcRenderer.invoke('calibration-profile', request),
  selectFile: () => ipcRenderer.invoke('select-file'),
  predict: (request) => ipcRenderer.invoke('predict', request),
  cancelPredict: (requestId) => ipcRenderer.invoke('cancel-predict', requestId),
  loadPerformance: () => ipcRenderer.invoke('load-performance'),
  savePerformance: (settings) => ipcRenderer.invoke('save-performance', settings),
  onPredictionProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('prediction-progress', listener);
    return () => ipcRenderer.removeListener('prediction-progress', listener);
  },
  measure: (geometry) => ipcRenderer.invoke('measure', geometry),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveCsv: (request) => ipcRenderer.invoke('save-csv', request),
  demoStudiesHidden: () => ipcRenderer.invoke('demo-studies-hidden'),
  setDemoStudiesHidden: (hidden) => ipcRenderer.invoke('set-demo-studies-hidden', hidden),
  loadStudies: () => ipcRenderer.invoke('load-studies'),
  saveStudies: (studies) => ipcRenderer.invoke('save-studies', studies),
  loadPrediction: (id) => ipcRenderer.invoke('load-prediction', id),
  savePrediction: (id, response) => ipcRenderer.invoke('save-prediction', id, response),
  deletePrediction: (id) => ipcRenderer.invoke('delete-prediction', id),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  scanFolder: (dirPath) => ipcRenderer.invoke('scan-folder', dirPath),
  chooseCsv: () => ipcRenderer.invoke('choose-csv'),
  readCsv: (filePath) => ipcRenderer.invoke('read-csv', filePath),
  // Electron >= 32 removed File.path; this is the sanctioned replacement, and File objects
  // cross the context bridge. Used by the Studies dropzone so a dropped film keeps a real path.
  pathForFile: (file) => webUtils.getPathForFile(file),
});
