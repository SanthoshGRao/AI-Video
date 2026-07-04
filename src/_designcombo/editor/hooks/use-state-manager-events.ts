import { useEffect, useCallback, useRef } from "react";
import StateManager from "@designcombo/state";
import useStore from "../store/use-store";
import { IAudio, ITrackItem, IVideo } from "@designcombo/types";
import { audioDataManager } from "../player/lib/audio-data";

// Global registry to prevent duplicate subscriptions
const subscriptionRegistry = new WeakMap<StateManager, Set<string>>();

export const useStateManagerEvents = (stateManager: StateManager) => {
  const { setState } = useStore();
  const isSubscribedRef = useRef(false);

  // Handle track item updates
  const handleTrackItemUpdate = useCallback(() => {
    const currentState = stateManager.getState();
    const mergedTrackItemsDeatilsMap = currentState.trackItemsMap;
    const filterTrakcItems = Object.values(mergedTrackItemsDeatilsMap).filter(
      (item) => {
        return item.type === "video" || item.type === "audio";
      }
    );
    audioDataManager.setItems(
      filterTrakcItems as (ITrackItem & (IVideo | IAudio))[]
    );
    audioDataManager.validateUpdateItems(
      filterTrakcItems as (ITrackItem & (IVideo | IAudio))[]
    );
    setState({
      duration: currentState.duration,
      trackItemsMap: currentState.trackItemsMap
    });
  }, [stateManager, setState]);

  const handleAddRemoveItems = useCallback(() => {
    const currentState = stateManager.getState();
    const mergedTrackItemsDeatilsMap = currentState.trackItemsMap;

    const filterTrakcItems = Object.values(mergedTrackItemsDeatilsMap).filter(
      (item) => {
        return item.type === "video" || item.type === "audio";
      }
    );
    audioDataManager.validateUpdateItems(
      filterTrakcItems as (ITrackItem & (IVideo | IAudio))[]
    );
    setState({
      trackItemsMap: currentState.trackItemsMap,
      trackItemIds: currentState.trackItemIds,
      tracks: currentState.tracks
    });
  }, [stateManager, setState]);

  const handleUpdateItemDetails = useCallback(() => {
    const currentState = stateManager.getState();
    setState({
      trackItemsMap: currentState.trackItemsMap
    });
  }, [stateManager, setState]);

  const handleUpdateItemTiming = useCallback(() => {
    const currentState = stateManager.getState();
    setState({
      trackItemsMap: currentState.trackItemsMap,
      duration: currentState.duration
    });
  }, [stateManager, setState]);

  useEffect(() => {
    console.log("useStateManagerEvents", stateManager);
    // Check if we already have subscriptions for this stateManager
    if (!subscriptionRegistry.has(stateManager)) {
      subscriptionRegistry.set(stateManager, new Set());
    }

    const registry = subscriptionRegistry.get(stateManager);
    if (!registry) return;
    const hookId = "useStateManagerEvents";

    // Prevent duplicate subscriptions
    if (registry.has(hookId)) {
      return;
    }

    registry.add(hookId);
    isSubscribedRef.current = true;

    // Subscribe to state update details
    const resizeDesignSubscription = stateManager.subscribeToUpdateStateDetails(
      (newState) => {
        setState(newState);
      }
    );

    // Subscribe to scale changes
    const scaleSubscription = stateManager.subscribeToScale((newState) => {
      setState(newState);
    });

    // Subscribe to general state changes
    let lastWidth = stateManager.getState().size.width;
    let lastHeight = stateManager.getState().size.height;

    const tracksSubscription = stateManager.subscribeToState((newState) => {
      const fullState = stateManager.getState();
      const currentWidth = fullState.size.width;
      const currentHeight = fullState.size.height;

      if (currentWidth !== lastWidth || currentHeight !== lastHeight) {
        const oldHeight = lastHeight;
        lastWidth = currentWidth;
        lastHeight = currentHeight;

        // Auto-reposition and clamp elements
        const trackItemsMap = { ...newState.trackItemsMap };
        let hasChanges = false;

        Object.keys(trackItemsMap).forEach((id) => {
          const item = trackItemsMap[id];
          if (item.type === "caption") {
            const details = item.details || {};
            const oldTopVal = parseFloat(String(details.top || 0));
            const oldRatio = oldTopVal / (oldHeight || 1920);

            let targetRatio = 0.78; // bottom
            if (oldRatio < 0.25) targetRatio = 0.08;
            else if (oldRatio < 0.6) targetRatio = 0.42;

            const newTop = currentHeight * targetRatio;
            const newWidth = Math.min(currentWidth - 80, 800);
            const newLeft = Math.max(40, (currentWidth - newWidth) / 2);

            trackItemsMap[id] = {
              ...item,
              details: {
                ...details,
                width: newWidth,
                left: `${newLeft}px`,
                top: `${newTop}px`,
              },
            } as any;
            hasChanges = true;
          } else if (item.type === "text" || item.type === "image" || item.type === "video") {
            const details = item.details || {};
            const leftVal = parseFloat(String(details.left || 0));
            const topVal = parseFloat(String(details.top || 0));
            const widthVal = parseFloat(String(details.width || 100));
            const heightVal = parseFloat(String(details.height || 100));

            let clampedLeft = leftVal;
            let clampedTop = topVal;

            if (leftVal + widthVal > currentWidth) {
              clampedLeft = Math.max(0, currentWidth - widthVal);
            }
            if (topVal + heightVal > currentHeight) {
              clampedTop = Math.max(0, currentHeight - heightVal);
            }

            if (clampedLeft !== leftVal || clampedTop !== topVal) {
              trackItemsMap[id] = {
                ...item,
                details: {
                  ...details,
                  left: `${clampedLeft}px`,
                  top: `${clampedTop}px`,
                },
              } as any;
              hasChanges = true;
            }
          }
        });

        if (hasChanges) {
          stateManager.updateState(
            { trackItemsMap },
            { updateHistory: false, kind: "design:resize" }
          );
          return; // Skip setState now; the nested updateState will trigger the subscription and run setState
        }
      }
      setState(newState);
    });

    // Subscribe to duration changes
    const durationSubscription = stateManager.subscribeToDuration(
      (newState) => {
        setState(newState);
      }
    );

    // Subscribe to track item updates
    const updateTrackItemsMap = stateManager.subscribeToUpdateTrackItem(
      handleTrackItemUpdate
    );

    // Subscribe to add/remove items
    const itemsDetailsSubscription =
      stateManager.subscribeToAddOrRemoveItems(handleAddRemoveItems);

    // Subscribe to item details updates
    const updateItemDetailsSubscription =
      stateManager.subscribeToUpdateItemDetails(handleUpdateItemDetails);

    // Subscribe to item timing updates (trimming)
    const updateItemTimingSubscription =
      stateManager.subscribeToUpdateTrackItemTiming(handleUpdateItemTiming);

    // Cleanup function to unsubscribe from all events
    return () => {
      if (isSubscribedRef.current) {
        scaleSubscription.unsubscribe();
        tracksSubscription.unsubscribe();
        durationSubscription.unsubscribe();
        itemsDetailsSubscription.unsubscribe();
        updateTrackItemsMap.unsubscribe();
        updateItemDetailsSubscription.unsubscribe();
        updateItemTimingSubscription.unsubscribe();
        resizeDesignSubscription.unsubscribe();

        // Remove from registry
        registry.delete(hookId);
        isSubscribedRef.current = false;
      }
    };
  }, [
    stateManager,
    setState,
    handleTrackItemUpdate,
    handleAddRemoveItems,
    handleUpdateItemDetails,
    handleUpdateItemTiming
  ]);
};
