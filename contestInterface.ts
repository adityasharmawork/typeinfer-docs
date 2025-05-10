interface contestInterface {
  contests: {
    id: number | number;
    platform: string | string;
    name: string | string;
    type: string | string;
    phase: string | string;
    frozen: boolean | boolean;
    startTimeSeconds: number | number;
    startTime: Date | Date;
    relativeTimeSeconds: number | number;
    durationSeconds: number | number;
    duration: string | string;
    url: string | string;
  }[];
}
