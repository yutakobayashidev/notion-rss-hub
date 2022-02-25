export type FeedSource = {
  Name: string;
  Url: string;
};

export type Article = {
  Title?: string;
  Url?: string;
  Published?: string;
  Date?: string;
  Action?: string;
  from_rss?: string;
  FeedSource: FeedSource;
};
