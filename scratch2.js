const fabric = require('fabric').fabric;

const canvas = new fabric.Canvas(null, { width: 500, height: 500 });
console.log('initial:', canvas.width, canvas.height);

canvas.loadFromJSON({ version: '5.3.0', objects: [] }, () => {
  console.log('after loadFromJSON without dimensions:', canvas.width, canvas.height);
});
