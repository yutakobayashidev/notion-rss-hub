import { FeedSource, Article } from './types';
import { BookmarkBlock, Page, TitlePropertyValue, URLPropertyValue } from '@notionhq/client/build/src/api-types';
import { InputPropertyValueMap } from '@notionhq/client/build/src/api-endpoints';
import { config } from 'dotenv';
import { RssArticle } from './RssArticle';
import { Notionclient } from './NotionClient';

config();

const notionClient = new Notionclient();

async function getFeedSources(): Promise<FeedSource[]> {
  const feedSources: FeedSource[] = [];

  async function getFeedSourcesFromNotion(cursor: string | undefined) {
    const currentPages = await notionClient.queryDatabase(process.env.FEED_SOURSES_NOTION_DATABASE_ID, cursor);

    for (const page of currentPages.results) {
      if (page.object === 'page') {
        const titleValue = page.properties['sourceName'] as TitlePropertyValue;
        const urlValue = page.properties['sourceUrl'] as URLPropertyValue;
        if (!urlValue.url || !titleValue) {
          throw `sourceName or sourceUrl must be set. page url: ${page.url}`;
        }

        feedSources.push({
          Name: titleValue.title[0].plain_text,
          Url: urlValue.url,
        });
      }
    }
    if (currentPages.has_more && currentPages.next_cursor) {
      await getFeedSourcesFromNotion(currentPages.next_cursor);
    }
  }

  await getFeedSourcesFromNotion(undefined);

  return feedSources;
}

async function findOrCreateOrUpdateArticlePages(articles: Article[]) {
  const articlePages = await getArticlePages();

  for (const article of articles) {
    const page = articlePages.find((articlePage) => {
      const urlValue = articlePage.properties['URL'] as URLPropertyValue;
      return urlValue.url === article.Url;
    });
    if (page) {
      updateArticlePage(page.id, article);
    } else {
      createArticlePage(article);
    }
  }
}

async function getArticlePages(): Promise<Page[]> {
  const pages: Page[] = [];

  async function getArticlePagesFromNotion(cursor: string | undefined) {
    const currentPages = await notionClient.queryDatabase(process.env.ARTICLES_NOTION_DATABASE_ID, cursor);
    pages.push(...currentPages.results);

    if (currentPages.has_more && currentPages.next_cursor) {
      await getArticlePagesFromNotion(currentPages.next_cursor);
    }
  }

  await getArticlePagesFromNotion(undefined);

  return pages;
}

async function createArticlePage(article: Article) {
  await notionClient.createPage({
    parent: {
      database_id: process.env.ARTICLES_NOTION_DATABASE_ID,
    },
    properties: articleProperties(article),
    children: [
      {
        object: 'block',
        type: 'bookmark',
        bookmark: {
          url: article.Url || '',
        },
      } as BookmarkBlock, // SDKの問題でidやcreated_timeもリクエストに含める必要がある https://github.com/makenotion/notion-sdk-js/issues/189
    ],
  });
}

async function updateArticlePage(pageId: string, article: Article) {
  await notionClient.updatePage({
    page_id: pageId,
    archived: false,
    properties: articleProperties(article),
  });
}

export function getHostFromURL(url: string) {
  const urlObj = new URL(url);
  return urlObj.hostname;
}

// TODO: キーを変更可能にする
function articleProperties(article: Article): InputPropertyValueMap {
  const hostname = article.Url ? getHostFromURL(article.Url) : '';

  return {
    title: {
      type: 'title',
      title: [
        {
          type: 'text',
          text: {
            content: article.Title || '',
          },
        },
      ],
    },
    Action: {
      type: 'rich_text',
      rich_text: [
        {
          type: 'text',
          text: {
            content: `Posted on ${hostname}`,
          },
        },
      ],
    },
    Published: {
      type: 'checkbox',
      checkbox: true,
    },
    from_rss: {
      type: 'checkbox',
      checkbox: true,
    },
    Date: {
      type: 'date',
      date: {
        start: article.Published || '',
      },
    },
    URL: {
      type: 'url',
      url: article.Url || '',
    },
  };
}

async function main() {
  const rssArticle = new RssArticle();
  const feedSources = await getFeedSources();
  const articles: Article[] = [];
  for (const feedSource of feedSources) {
    const res = await rssArticle.fetchArticles(feedSource);
    articles.push(...res);
  }
  findOrCreateOrUpdateArticlePages(articles);
}
main();
