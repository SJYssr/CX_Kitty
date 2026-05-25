import { EventEmitter } from 'events';
const bus = new EventEmitter();
bus.setMaxListeners(1000);
export default bus;
