// Browser-test init script only. Runs the real dedicated worker and delays delivery
// of one actual message; never fabricates geometry, success or validation output.
(() => {
  if (window.terrainWorkerGate) return;
  const NativeWorker = window.Worker;
  const gate = window.terrainWorkerGate = {
    armed: false, held: null, delivered: [],
    release() {
      if (!this.held) throw Error('No worker result held');
      const held = this.held; this.held = null;
      held.deliver();
    },
  };
  window.Worker = class extends NativeWorker {
    listeners = new Map();
    addEventListener(type, listener, options) {
      if (type !== 'message' || typeof listener !== 'function') return super.addEventListener(type, listener, options);
      const wrapped = event => {
        const deliver = () => { gate.delivered.push(event.data.jobId); listener.call(this, event); };
        if (gate.armed) { gate.armed = false; gate.held = { jobId: event.data.jobId, status: event.data.status, deliver }; }
        else deliver();
      };
      this.listeners.set(listener, wrapped);
      return super.addEventListener(type, wrapped, options);
    }
    removeEventListener(type, listener, options) {
      const wrapped = type === 'message' ? this.listeners.get(listener) : null;
      this.listeners.delete(listener);
      return super.removeEventListener(type, wrapped ?? listener, options);
    }
  };
})();
