import { getRuntimeRepository } from "@agentarxiv/db";

let repositoryInstance: ReturnType<typeof getRuntimeRepository> | undefined;

function resolveRepository() {
  repositoryInstance ??= getRuntimeRepository();
  return repositoryInstance;
}

export const repository = new Proxy({} as ReturnType<typeof getRuntimeRepository>, {
  get(_target, property, receiver) {
    return Reflect.get(resolveRepository(), property, receiver);
  },
});
