interface data {
  contests: {
    id: number;
    platform: string;
    name: string;
    type: string;
    phase: string;
    frozen: boolean;
    startTimeSeconds: number;
    startTime: Date;
    relativeTimeSeconds: number;
    durationSeconds: number;
    duration: string;
    url: string;
  }[];
  newtest?: string;
}
