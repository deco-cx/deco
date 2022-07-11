/** @jsx h */
import { h } from "preact";
import { asset, Head } from "$fresh/runtime.ts";

export interface HeadProps {
  title: string;
  description: string;
  url: URL;
  imageUrl: string;
  faviconUrl: string;
  styleUrls: string[];
  themeColor: string;
}

export default function HeadComponent(
  { title, description, url, imageUrl, faviconUrl, styleUrls, themeColor }:
    HeadProps,
) {
  return (
    <Head>
      <title>{title}</title>
      <meta name="theme-color" content={themeColor}></meta>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url.href} />
      <meta
        property="og:image"
        content={imageUrl}
      />
      <link
        rel="shortcut icon"
        href={faviconUrl}
        type="image/x-icon"
      >
      </link>
      {styleUrls.map((styleUrl: string) => (
        <link rel="stylesheet" href={asset(styleUrl)}></link>
      ))}
    </Head>
  );
}
