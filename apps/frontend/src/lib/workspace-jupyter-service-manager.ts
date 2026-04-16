import {
  ServerConnection,
  SettingManager,
  WorkspaceManager,
  type ServiceManager,
} from "@jupyterlab/services";
import { Signal } from "@lumino/signaling";

const WORKSPACE_SHELL = {
  data: {
    "layout-restorer:data": {
      main: { dock: null },
      down: { size: 0, widgets: [] },
      left: { collapsed: true, visible: true, widgetStates: {} },
      right: { collapsed: true, visible: true, widgetStates: {} },
      relativeSizes: [],
      top: { simpleVisibility: true },
    },
  },
  metadata: {
    id: "default",
    last_modified: "2026-04-14T00:00:00.000Z",
    created: "2026-04-14T00:00:00.000Z",
  },
};

function getDefaultServerSettings() {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;

  return ServerConnection.makeSettings({
    baseUrl: new URL("/", origin).toString(),
    wsUrl: origin.replace(/^http/i, "ws"),
    token: "",
  });
}

class TerminalManagerLess {
  runningChanged = new Signal<this, void>(this);
  connectionFailure = new Signal<this, Error>(this);
  isReady = true;
  ready = Promise.resolve(void 0);
  isActive = true;
  disposed = new Signal<this, void>(this);
  isDisposed = false;

  constructor(public serverSettings: ServerConnection.ISettings) {}

  isAvailable() {
    return true;
  }

  running() {
    return [][Symbol.iterator]();
  }

  startNew() {
    return Promise.resolve({} as never);
  }

  connectTo() {
    return {} as never;
  }

  shutdown() {
    return Promise.resolve(void 0);
  }

  shutdownAll() {
    return Promise.resolve(void 0);
  }

  refreshRunning() {
    return Promise.resolve(void 0);
  }

  dispose() {}
}

class ContentsManagerLess {
  fileChanged = new Signal<this, never>(this);
  isDisposed = false;

  constructor(public serverSettings: ServerConnection.ISettings) {}

  addDrive() {}
  localPath(path: string) {
    return path;
  }
  normalize(path: string) {
    return path;
  }
  resolvePath(root: string, path: string) {
    return root + path;
  }
  driveName() {
    return "";
  }
  getSharedModelFactory() {
    return null;
  }
  get() {
    return Promise.resolve({} as never);
  }
  getDownloadUrl(path: string) {
    return Promise.resolve(path);
  }
  newUntitled() {
    return Promise.resolve({} as never);
  }
  delete() {
    return Promise.resolve(void 0);
  }
  rename() {
    return Promise.resolve({} as never);
  }
  save() {
    return Promise.resolve({} as never);
  }
  copy() {
    return Promise.resolve({} as never);
  }
  createCheckpoint() {
    return Promise.resolve({} as never);
  }
  listCheckpoints() {
    return Promise.resolve([] as never);
  }
  restoreCheckpoint() {
    return Promise.resolve(void 0);
  }
  deleteCheckpoint() {
    return Promise.resolve(void 0);
  }
  dispose() {}
}

class KernelManagerLess {
  runningChanged = new Signal<this, void>(this);
  connectionFailure = new Signal<this, Error>(this);
  isReady = true;
  ready = Promise.resolve(void 0);
  isActive = true;
  disposed = new Signal<this, void>(this);
  isDisposed = false;
  runningCount = 0;

  constructor(public serverSettings: ServerConnection.ISettings) {}

  running() {
    return [][Symbol.iterator]();
  }

  refreshRunning() {
    return Promise.resolve(void 0);
  }

  startNew() {
    return Promise.resolve({} as never);
  }

  findById() {
    return Promise.resolve(undefined);
  }

  connectTo() {
    return {} as never;
  }

  shutdown() {
    return Promise.resolve(void 0);
  }

  shutdownAll() {
    return Promise.resolve(void 0);
  }

  dispose() {}
}

class KernelspecManagerLess {
  specsChanged = new Signal<this, void>(this);
  specs = null;
  connectionFailure = new Signal<this, Error>(this);
  isReady = true;
  ready = Promise.resolve(void 0);
  isActive = true;
  disposed = new Signal<this, void>(this);
  isDisposed = false;

  constructor(public serverSettings: ServerConnection.ISettings) {}

  refreshSpecs() {
    return Promise.resolve(void 0);
  }

  dispose() {}
}

class SessionManagerLess {
  runningChanged = new Signal<this, void>(this);
  connectionFailure = new Signal<this, Error>(this);
  isReady = true;
  ready = Promise.resolve(void 0);
  isDisposed = false;

  constructor(public serverSettings: ServerConnection.ISettings) {}

  running() {
    return [][Symbol.iterator]();
  }

  startNew() {
    return Promise.resolve({} as never);
  }

  findById() {
    return Promise.resolve(undefined);
  }

  findByPath() {
    return Promise.resolve(undefined);
  }

  connectTo() {
    return {} as never;
  }

  shutdown() {
    return Promise.resolve(void 0);
  }

  shutdownAll() {
    return Promise.resolve(void 0);
  }

  refreshRunning() {
    return Promise.resolve(void 0);
  }

  stopIfNeeded() {
    return Promise.resolve(void 0);
  }

  dispose() {}
}

class BuilderManagerLess {
  constructor(public serverSettings: ServerConnection.ISettings) {}

  get isAvailable() {
    return true;
  }

  get shouldCheck() {
    return false;
  }

  getStatus() {
    return Promise.resolve({} as never);
  }

  build() {
    return Promise.resolve(void 0);
  }

  cancel() {
    return Promise.resolve(void 0);
  }
}

class SettingManagerLess extends SettingManager {
  constructor(public override serverSettings: ServerConnection.ISettings) {
    super({ serverSettings });
  }

  override save() {
    return Promise.resolve(void 0);
  }

  override remove() {
    return Promise.resolve(void 0);
  }
}

class UserManagerLess {
  userChanged = new Signal<this, void>(this);
  identity = {
    username: "workspace",
    name: "Workspace Notebook",
    display_name: "Workspace Notebook",
    initials: "WN",
    color: "#d27f43",
  };
  permissions = {};
  connectionFailure = new Signal<this, Error>(this);
  isReady = true;
  ready = Promise.resolve(void 0);
  isActive = true;
  disposed = new Signal<this, void>(this);
  isDisposed = false;

  constructor(public serverSettings: ServerConnection.ISettings) {}

  refreshUser() {
    return Promise.resolve(void 0);
  }

  dispose() {}
}

class EventsManagerLess {
  stream = null;
  isDisposed = false;

  constructor(public serverSettings: ServerConnection.ISettings) {}

  emit() {
    return Promise.resolve(void 0);
  }

  dispose() {}
}

class WorkspaceManagerLess extends WorkspaceManager {
  constructor(public override serverSettings: ServerConnection.ISettings) {
    super({ serverSettings });
  }

  override fetch() {
    return Promise.resolve(WORKSPACE_SHELL as never);
  }

  override list() {
    return Promise.resolve({
      ids: [WORKSPACE_SHELL.metadata.id],
      values: [WORKSPACE_SHELL],
    } as never);
  }
}

class NbConvertManagerLess {
  constructor(public serverSettings: ServerConnection.ISettings) {}

  fetchExportFormats() {
    return Promise.resolve({} as never);
  }

  getExportFormats() {
    return Promise.resolve({} as never);
  }
}

class WorkspaceNotebookServiceManager {
  readonly __NAME__ = "WorkspaceNotebookServiceManager";
  isReady = true;
  ready = Promise.resolve(void 0);
  isDisposed = false;
  connectionFailure = new Signal<this, Error>(this);
  serverSettings: ServerConnection.ISettings;
  builder: BuilderManagerLess;
  contents: ContentsManagerLess;
  events: EventsManagerLess;
  sessions: SessionManagerLess;
  kernels: KernelManagerLess;
  kernelspecs: KernelspecManagerLess;
  settings: SettingManagerLess;
  terminals: TerminalManagerLess;
  user: UserManagerLess;
  workspaces: WorkspaceManagerLess;
  nbconvert: NbConvertManagerLess;

  constructor(serverSettings?: ServerConnection.ISettings) {
    this.serverSettings = serverSettings ?? getDefaultServerSettings();
    this.contents = new ContentsManagerLess(this.serverSettings);
    this.kernels = new KernelManagerLess(this.serverSettings);
    this.kernelspecs = new KernelspecManagerLess(this.serverSettings);
    this.sessions = new SessionManagerLess(this.serverSettings);
    this.settings = new SettingManagerLess(this.serverSettings);
    this.terminals = new TerminalManagerLess(this.serverSettings);
    this.user = new UserManagerLess(this.serverSettings);
    this.builder = new BuilderManagerLess(this.serverSettings);
    this.events = new EventsManagerLess(this.serverSettings);
    this.workspaces = new WorkspaceManagerLess(this.serverSettings);
    this.nbconvert = new NbConvertManagerLess(this.serverSettings);
  }

  dispose() {}

  get_name = () => this.__NAME__;
}

export function createWorkspaceNotebookServiceManager() {
  return new WorkspaceNotebookServiceManager() as unknown as ServiceManager.IManager;
}
