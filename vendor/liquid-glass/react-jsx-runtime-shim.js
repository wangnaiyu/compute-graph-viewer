import React from "./react-shim.js";

export const Fragment = React.Fragment;

export function jsx(type, props, key) {
  const finalProps = key === undefined ? props : { ...props, key };
  return React.createElement(type, finalProps);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
