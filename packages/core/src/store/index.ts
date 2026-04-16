import { FileStoreRepository } from "./file-store";

let repository: FileStoreRepository | undefined;

export const getRepository = () => {
  if (!repository) {
    repository = new FileStoreRepository();
  }

  return repository;
};
