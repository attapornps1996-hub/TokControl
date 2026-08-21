// screenForwarder.js
const screenEvents = require('./screenEvents');
const { sendToWeb } = require('./bridge');

function initScreenForwarder() {

  screenEvents.on('screen:connect', (data) => {
        // console.log(data);
    sendToWeb('TO_WEB', {
      type: 'screen:connect',
      payload: data
    });
  });

  screenEvents.on('screen:disconnect', (data) => {
        // console.log(data);
    sendToWeb('TO_WEB', {
      type: 'screen:disconnect',
      payload: data
    });
  });

  // อนาคต: event อื่น ๆ
  // screenEvents.on('score:update', ...)
}

module.exports = {
  initScreenForwarder
};
