import { asset, Head } from "$fresh/runtime.ts";
import { Section } from "$live/blocks/section.ts";

export interface Props {
  title?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  faviconUrl?: string;
  styleUrls?: string[];
  inlineStyles?: string[];
  scriptUrls?: string[];
  inlineScripts?: string[];
  themeColor?: string;
}

export default function HeadComponent({
  title,
  description,
  url,
  imageUrl,
  faviconUrl,
  styleUrls,
  inlineStyles,
  scriptUrls,
  inlineScripts,
  themeColor,
}: Props) {
  return (
    <Head>
      <title>{title}</title>
      <meta name="theme-color" content={themeColor}></meta>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
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
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
      </link>
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
      </link>
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
      </link>
      <link rel="manifest" href="/site.webmanifest"></link>
      <link
        rel="mask-icon"
        href="/safari-pinned-tab.svg"
        data-color={themeColor}
      >
      </link>
      <meta name="theme-color" content={themeColor}></meta>
      <meta name="msapplication-TileColor" content={themeColor}></meta>
      {styleUrls?.map((styleUrl: string) => (
        <link rel="stylesheet" href={asset(styleUrl)}></link>
      ))}
      {inlineStyles?.map((inlineStyle: string) => (
        <style
          dangerouslySetInnerHTML={{
            __html: inlineStyle,
          }}
        />
      ))}
      {scriptUrls?.map((scriptUrl: string) => (
        <script type="text/javascript" src={asset(scriptUrl)} />
      ))}
      {inlineScripts?.map((inlineScript: string) => (
        <script
          type="text/javascript"
          dangerouslySetInnerHTML={{
            __html: inlineScript,
          }}
        />
      ))}
    </Head>
  );
}
