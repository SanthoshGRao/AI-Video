import useStore from "../store/use-store";
import { useEffect, useRef } from "react";
import { filter, subject } from "@designcombo/events";
import {
  PLAYER_PAUSE,
  PLAYER_PLAY,
  PLAYER_PREFIX,
  PLAYER_SEEK,
  PLAYER_SEEK_BY,
  PLAYER_TOGGLE_PLAY
} from "../constants/events";
import { LAYER_PREFIX, LAYER_SELECTION } from "@designcombo/state";
import { TIMELINE_SEEK, TIMELINE_PREFIX } from "@designcombo/timeline";
import { getSafeCurrentFrame } from "../utils/time";

const useTimelineEvents = () => {
  const { playerRef, fps, timeline, setState } = useStore();
  const lastCommittedTimeRef = useRef<number>(-1);
  const lastCommittedAtRef = useRef<number>(0);

  //handle player events
  useEffect(() => {
    const playerEvents = subject.pipe(
      filter(({ key }) => key.startsWith(PLAYER_PREFIX))
    );
    const timelineEvents = subject.pipe(
      filter(({ key }) => key.startsWith(TIMELINE_PREFIX))
    );

    const timelineEventsSubscription = timelineEvents.subscribe((obj) => {
      if (obj.key === TIMELINE_SEEK) {
        const time = obj.value?.payload?.time;
        if (playerRef?.current && typeof time === "number") {
          playerRef.current.seekTo(Math.round((time / 1000) * fps));
        }
      }
    });
    const playerEventsSubscription = playerEvents.subscribe((obj) => {
      if (obj.key === PLAYER_SEEK) {
        const time = obj.value?.payload?.time;
        if (playerRef?.current && typeof time === "number") {
          playerRef.current.seekTo(Math.round((time / 1000) * fps));
        }
      } else if (obj.key === PLAYER_PLAY) {
        playerRef?.current?.play();
      } else if (obj.key === PLAYER_PAUSE) {
        playerRef?.current?.pause();
      } else if (obj.key === PLAYER_TOGGLE_PLAY) {
        if (playerRef?.current?.isPlaying()) {
          playerRef.current.pause();
        } else {
          playerRef?.current?.play();
        }
      } else if (obj.key === PLAYER_SEEK_BY) {
        const frames = obj.value?.payload?.frames;
        if (playerRef?.current && typeof frames === "number") {
          const safeCurrentFrame = getSafeCurrentFrame(playerRef);
          playerRef.current.seekTo(Math.round(safeCurrentFrame) + frames);
        }
      }
    });

    return () => {
      playerEventsSubscription.unsubscribe();
      timelineEventsSubscription.unsubscribe();
    };
  }, [playerRef, fps]);

  // handle selection events
  useEffect(() => {
    const selectionEvents = subject.pipe(
      filter(({ key }) => key.startsWith(LAYER_PREFIX))
    );

    const selectionSubscription = selectionEvents.subscribe((obj) => {
      if (obj.key === LAYER_SELECTION) {
        setState({
          activeIds: obj.value?.payload.activeIds
        });
      }
    });
    return () => selectionSubscription.unsubscribe();
  }, [timeline]);

  // Synchronize player updates (play, pause, frame/time updates) to useStore
  useEffect(() => {
    let active = true;
    let bound = false;
    let playerInstance: any = null;

    const commitCurrentTime = (force = false) => {
      if (!playerInstance) return;
      const currentFrame = playerInstance.getCurrentFrame();
      const timeMs = Math.round((currentFrame / fps) * 1000);
      const now = performance.now();

      if (
        !force &&
        Math.abs(timeMs - lastCommittedTimeRef.current) < 80 &&
        now - lastCommittedAtRef.current < 120
      ) {
        return;
      }

      lastCommittedTimeRef.current = timeMs;
      lastCommittedAtRef.current = now;
      setState({ currentTime: timeMs });
    };

    const onPlay = () => {
      commitCurrentTime(true);
      setState({ playbackState: "playing" });
    };
    const onPause = () => {
      commitCurrentTime(true);
      setState({ playbackState: "paused" });
    };
    const onSeeked = () => {
      commitCurrentTime(true);
    };
    const onFrameUpdate = () => {
      commitCurrentTime(false);
    };

    const tryBind = () => {
      if (!active) return;
      const player = playerRef?.current;
      if (player) {
        playerInstance = player;
        player.addEventListener("play", onPlay);
        player.addEventListener("pause", onPause);
        player.addEventListener("seeked", onSeeked);
        player.addEventListener("frameupdate", onFrameUpdate);

        // Set initial states
        const initialTime = Math.round((player.getCurrentFrame() / fps) * 1000);
        lastCommittedTimeRef.current = initialTime;
        lastCommittedAtRef.current = performance.now();
        setState({
          playbackState: player.isPlaying() ? "playing" : "paused",
          currentTime: initialTime,
        });
        bound = true;
      } else {
        setTimeout(tryBind, 50);
      }
    };

    tryBind();

    return () => {
      active = false;
      if (bound && playerInstance) {
        playerInstance.removeEventListener("play", onPlay);
        playerInstance.removeEventListener("pause", onPause);
        playerInstance.removeEventListener("seeked", onSeeked);
        playerInstance.removeEventListener("frameupdate", onFrameUpdate);
      }
    };
  }, [playerRef, fps, setState]);
};

export default useTimelineEvents;
