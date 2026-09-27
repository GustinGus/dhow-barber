import { createLocalDataRepositories } from "./local-repository";

export * from "./types";
export { createLocalDataRepositories } from "./local-repository";

/** Repositories used by the app. Browser storage is the only data source for now. */
export const dataRepositories = createLocalDataRepositories();
