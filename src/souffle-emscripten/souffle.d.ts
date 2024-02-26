/// <reference types="emscripten" />

export type SouffleModule = EmscriptenModule & {
  FS: typeof FS,
  callMain: (args: string[]) => void,
}

declare const loadSouffleModule: EmscriptenModuleFactory<SouffleModule>;
export default loadSouffleModule;
