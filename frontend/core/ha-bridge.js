export class HABridge {
  constructor(connection) {
    this.connection = connection;
    this.entities = new Map();
    this.listeners = new Set();
  }

  async loadConfig() {
    return this.connection.sendMessagePromise({ type: "cyborg_dashboard/get_config" });
  }

  async saveConfig(config) {
    return this.connection.sendMessagePromise({ type: "cyborg_dashboard/save_config", config });
  }

  subscribeStates(callback) {
    const listener = (event) => {
      if (event.data?.type === "event" && event.data.event?.event_type === "state_changed") {
        callback(event.data.event.data.new_state);
      }
    };
    this.connection.addEventListener("message", listener);
    return () => this.connection.removeEventListener("message", listener);
  }
}
