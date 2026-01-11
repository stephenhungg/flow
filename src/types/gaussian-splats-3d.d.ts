declare module '@mkkellogg/gaussian-splats-3d' {
  export class Viewer {
    constructor(options?: ViewerOptions);

    rootElement: HTMLElement;
    camera: any;

    init(): Promise<void>;
    start(): void;
    update(): void;
    render(): void;
    dispose(): void;

    addSplatScene(
      url: string,
      options?: {
        progressiveLoad?: boolean;
        rotation?: number[];
        position?: number[];
        scale?: number[];
      }
    ): Promise<void>;

    setRenderDimensions(width: number, height: number): void;
  }

  interface ViewerOptions {
    selfDrivenMode?: boolean;
    renderer?: {
      antialias?: boolean;
      alpha?: boolean;
    };
    camera?: {
      fov?: number;
      near?: number;
      far?: number;
      position?: number[];
    };
    controls?: {
      enabled?: boolean;
      enableRotate?: boolean;
      enablePan?: boolean;
      enableZoom?: boolean;
      rotateSpeed?: number;
      mouseRotateSpeed?: number;
      pointerLockMode?: boolean;
    };
    useBuiltInControls?: boolean;
  }
}
