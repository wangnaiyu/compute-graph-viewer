const React = window.React;

if (!React) {
  throw new Error("React must be loaded on window before liquid-glass.esm.js");
}

export default React;
export const Fragment = React.Fragment;
export const createElement = React.createElement;
export const forwardRef = React.forwardRef;
export const useCallback = React.useCallback;
export const useEffect = React.useEffect;
export const useId = React.useId;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useRef = React.useRef;
export const useState = React.useState;
