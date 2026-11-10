/**
 * The split-screen layout for retention clips: the clip fills the top half of a
 * 1080x1920 frame and a looping, muted video such as gameplay fills the bottom.
 * Input 0 is the clip, input 1 the retention video.
 */

const half = (input: string, label: string) =>
  `[${input}:v]fps=30,crop='min(iw,ih*9/8)':'min(ih,iw*8/9)',scale=1080:960,setsar=1[${label}]`;

export const splitScreenFilter = (captions: boolean) =>
  [
    half("0", "top"),
    half("1", "bottom"),
    `[top][bottom]vstack=inputs=2,format=yuv420p${captions ? ",subtitles=captions.ass:fontsdir=fonts" : ""}[out]`,
  ].join(";");

/**
 * Where in the retention video to start, taken from the clip's own start so
 * clips from one video do not all show the same stretch of gameplay.
 */
export const retentionStartSec = (clipStartSec: number, durationSec: number) =>
  durationSec > 0 ? clipStartSec % durationSec : 0;
