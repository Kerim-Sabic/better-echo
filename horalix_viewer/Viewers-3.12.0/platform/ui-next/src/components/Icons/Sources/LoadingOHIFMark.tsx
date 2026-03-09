import React from 'react';
import type { IconProps } from '../types';

export const LoadingOHIFMark = (props: IconProps) => (
  <svg
    viewBox="0 0 32 32"
    width="32"
    height="32"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <image
      href="/horalix-logo.png"
      x="0"
      y="0"
      width="32"
      height="32"
      preserveAspectRatio="xMidYMid meet"
    />
  </svg>
);

export default LoadingOHIFMark;
