import { ISize } from "@designcombo/types";
import { useCallback, useEffect, useRef, useState } from "react";

function useZoom(containerRef: React.RefObject<HTMLDivElement>, size: ISize) {
  const [zoom, setZoom] = useState(0.01);
  const currentZoomRef = useRef(0.01);
  const fitZoomRef = useRef(0.01);

  const calculateZoom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const PADDING = 30;
    const containerHeight = container.clientHeight - PADDING;
    const containerWidth = container.clientWidth - PADDING;
    const { width, height } = size;

    const desiredZoom = Math.min(
      containerWidth / width,
      containerHeight / height
    );
    fitZoomRef.current = desiredZoom;
    currentZoomRef.current = desiredZoom;
    setZoom(desiredZoom);
  }, [containerRef, size]);

  const setBoundedZoom = useCallback((nextZoom: number) => {
    const bounded = Math.max(0.02, Math.min(4, nextZoom));
    currentZoomRef.current = bounded;
    setZoom(bounded);
  }, []);

  useEffect(() => {
    calculateZoom();
  }, [calculateZoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use ResizeObserver to watch for container size changes
    const resizeObserver = new ResizeObserver(() => {
      calculateZoom();
    });

    resizeObserver.observe(container);

    // Also listen for window resize events
    const handleWindowResize = () => {
      calculateZoom();
    };

    window.addEventListener("resize", handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [calculateZoom]);

  const handlePinch = useCallback((e: { inputEvent: WheelEvent }) => {
    const deltaY = e.inputEvent.deltaY;
    const changer = deltaY > 0 ? 0.0085 : -0.0085;
    setBoundedZoom(currentZoomRef.current + changer);
  }, [setBoundedZoom]);

  const zoomIn = useCallback(() => setBoundedZoom(currentZoomRef.current * 1.12), [setBoundedZoom]);
  const zoomOut = useCallback(() => setBoundedZoom(currentZoomRef.current / 1.12), [setBoundedZoom]);
  const zoom100 = useCallback(() => setBoundedZoom(1), [setBoundedZoom]);
  const fitToScreen = useCallback(() => setBoundedZoom(fitZoomRef.current), [setBoundedZoom]);
  const fillScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const PADDING = 30;
    setBoundedZoom(
      Math.max(
        (container.clientWidth - PADDING) / size.width,
        (container.clientHeight - PADDING) / size.height
      )
    );
  }, [containerRef, setBoundedZoom, size.height, size.width]);

  return {
    zoom,
    handlePinch,
    recalculateZoom: calculateZoom,
    fitToScreen,
    fillScreen,
    zoom100,
    zoomIn,
    zoomOut,
  };
}

export default useZoom;
