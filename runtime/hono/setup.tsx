import type { Hono, MiddlewareHandler } from "@hono/hono";
import "../../utils/patched_fetch.ts";
import type { DecoHandler, DecoRouteState } from "./middleware.ts";
import { liveness } from "./middlewares/0_liveness.ts";

import { buildDecoState } from "./middlewares/3_stateBuilder.ts";

import type { AppManifest } from "../../mod.ts";
import { contextProvider } from "./middlewares/1_contextProvider.ts";
import { alienRelease } from "./middlewares/2_alienRelease.ts";
import { handler as decod } from "./middlewares/2_daemon.ts";
import { handler as main } from "./middlewares/4_main.ts";

import { serveStatic, upgradeWebSocket } from "@hono/hono/deno";
import { context } from "deco/deco.ts";
import type { ComponentChildren, ComponentType } from "preact";
import { renderToString } from "preact-render-to-string";
import { join } from "std/path/join.ts";
import { handler as metaHandler } from "./routes/_meta.ts";
import { handler as invokeHandler } from "./routes/batchInvoke.ts";
import {
    default as PreviewPage,
    handler as previewHandler,
} from "./routes/blockPreview.tsx";
import {
    default as Render,
    handler as entrypoint,
} from "./routes/entrypoint.tsx";
import { handler as inspectHandler } from "./routes/inspect.ts";
import { handler as invokeKeyHandler } from "./routes/invoke.ts";
import {
    default as PreviewsPage,
    handler as previewsHandler,
} from "./routes/previews.tsx";
import { handler as releaseHandler } from "./routes/release.ts";
import { handler as renderHandler } from "./routes/render.tsx";
import { handler as workflowHandler } from "./routes/workflow.ts";

import { options } from "preact";
import { useFramework } from "../../components/section.tsx";

export const Head = ({ children }: { children: ComponentChildren }) => {
    const { Head } = useFramework();
    return Head ? <Head>{children}</Head> : null;
};

const DEV_SERVER_PATH = `/deco/dev`;
const DEV_SERVER_SCRIPT = (
    <script
        dangerouslySetInnerHTML={{
            __html: `
// Debounce function to limit the rate of page refreshes
function debounce(func, delay) {
let timeoutId;
return function(...args) {
if (timeoutId) clearTimeout(timeoutId);
timeoutId = setTimeout(() => func.apply(null, args), delay);
};
}

// Function to refresh the page
function refreshPage() {
window.location.reload();
}

// Debounced version of refreshPage
const debouncedRefresh = debounce(refreshPage, 100);

// Function to set up the WebSocket and listen for messages
function setupWebSocket() {
// Construct WebSocket URL based on current domain and protocol
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = window.location.host;
const path = '${DEV_SERVER_PATH}';
const wsUrl = \`\${protocol}//\${host}\${path}\`;

// Create a WebSocket connection
const socket = new WebSocket(wsUrl);

// Add an event listener for messages
socket.addEventListener('message', function(event) {
// Call the debounced function to refresh the page
debouncedRefresh();
});

// Handle errors
socket.addEventListener('error', function(error) {
console.error('WebSocket Error:', error);
});

// Clean up the WebSocket connection when the page is unloaded
window.addEventListener('beforeunload', function() {
socket.close();
});
}

// Run the setup function when the page loads
window.onload = setupWebSocket;
`,
        }}
    >
    </script>
);

const styles = `/*! tailwindcss v3.4.1 | MIT License | https://tailwindcss.com*/
*,:after,:before {
    box-sizing: border-box;
    border: 0 solid #e5e7eb
}

:after,:before {
    --tw-content: ""
}

:host,html {
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
    -moz-tab-size: 4;
    -o-tab-size: 4;
    tab-size: 4;
    font-family: ui-sans-serif,system-ui,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;
    font-feature-settings: normal;
    font-variation-settings: normal;
    -webkit-tap-highlight-color: transparent
}

body {
    margin: 0;
    line-height: inherit
}

hr {
    height: 0;
    color: inherit;
    border-top-width: 1px
}

abbr:where([title]) {
    -webkit-text-decoration: underline dotted;
    text-decoration: underline dotted
}

h1,h2,h3,h4,h5,h6 {
    font-size: inherit;
    font-weight: inherit
}

a {
    color: inherit;
    text-decoration: inherit
}

b,strong {
    font-weight: bolder
}

code,kbd,pre,samp {
    font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace;
    font-feature-settings: normal;
    font-variation-settings: normal;
    font-size: 1em
}

small {
    font-size: 80%
}

sub,sup {
    font-size: 75%;
    line-height: 0;
    position: relative;
    vertical-align: baseline
}

sub {
    bottom: -.25em
}

sup {
    top: -.5em
}

table {
    text-indent: 0;
    border-color: inherit;
    border-collapse: collapse
}

button,input,optgroup,select,textarea {
    font-family: inherit;
    font-feature-settings: inherit;
    font-variation-settings: inherit;
    font-size: 100%;
    font-weight: inherit;
    line-height: inherit;
    color: inherit;
    margin: 0;
    padding: 0
}

button,select {
    text-transform: none
}

[type=button],[type=reset],[type=submit],button {
    -webkit-appearance: button;
    background-color: transparent;
    background-image: none
}

:-moz-focusring {
    outline: auto
}

:-moz-ui-invalid {
    box-shadow: none
}

progress {
    vertical-align: baseline
}

::-webkit-inner-spin-button,::-webkit-outer-spin-button {
    height: auto
}

[type=search] {
    -webkit-appearance: textfield;
    outline-offset: -2px
}

::-webkit-search-decoration {
    -webkit-appearance: none
}

::-webkit-file-upload-button {
    -webkit-appearance: button;
    font: inherit
}

summary {
    display: list-item
}

blockquote,dd,dl,figure,h1,h2,h3,h4,h5,h6,hr,p,pre {
    margin: 0
}

fieldset {
    margin: 0
}

fieldset,legend {
    padding: 0
}

menu,ol,ul {
    list-style: none;
    margin: 0;
    padding: 0
}

dialog {
    padding: 0
}

textarea {
    resize: vertical
}

input::-moz-placeholder,textarea::-moz-placeholder {
    opacity: 1;
    color: #9ca3af
}

input::placeholder,textarea::placeholder {
    opacity: 1;
    color: #9ca3af
}

[role=button],button {
    cursor: pointer
}

:disabled {
    cursor: default
}

audio,canvas,embed,iframe,img,object,svg,video {
    display: block;
    vertical-align: middle
}

img,video {
    max-width: 100%;
    height: auto
}

[hidden] {
    display: none
}

:root,[data-theme] {
    background-color: var(--fallback-b1,oklch(var(--b1)/1));
    color: var(--fallback-bc,oklch(var(--bc)/1))
}

@supports not (color: oklch(0 0 0)) {
    :root {
        color-scheme:light;
        --fallback-p: #491eff;
        --fallback-pc: #d4dbff;
        --fallback-s: #ff41c7;
        --fallback-sc: #fff9fc;
        --fallback-a: #00cfbd;
        --fallback-ac: #00100d;
        --fallback-n: #2b3440;
        --fallback-nc: #d7dde4;
        --fallback-b1: #fff;
        --fallback-b2: #e5e6e6;
        --fallback-b3: #e5e6e6;
        --fallback-bc: #1f2937;
        --fallback-in: #00b3f0;
        --fallback-inc: #000;
        --fallback-su: #00ca92;
        --fallback-suc: #000;
        --fallback-wa: #ffc22d;
        --fallback-wac: #000;
        --fallback-er: #ff6f70;
        --fallback-erc: #000
    }

    @media (prefers-color-scheme: dark) {
        :root {
            color-scheme:dark;
            --fallback-p: #7582ff;
            --fallback-pc: #050617;
            --fallback-s: #ff71cf;
            --fallback-sc: #190211;
            --fallback-a: #00c7b5;
            --fallback-ac: #000e0c;
            --fallback-n: #2a323c;
            --fallback-nc: #a6adbb;
            --fallback-b1: #1d232a;
            --fallback-b2: #191e24;
            --fallback-b3: #15191e;
            --fallback-bc: #a6adbb;
            --fallback-in: #00b3f0;
            --fallback-inc: #000;
            --fallback-su: #00ca92;
            --fallback-suc: #000;
            --fallback-wa: #ffc22d;
            --fallback-wac: #000;
            --fallback-er: #ff6f70;
            --fallback-erc: #000
        }
    }
}

html {
    -webkit-tap-highlight-color: transparent;
    font-family: var(--font-family)
}

input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0
}

body:has(.drawer-toggle:checked),body:has(.modal-toggle:checked) {
    overflow: hidden;
    height: 100vh
}

*,:after,:before {
    --tw-border-spacing-x: 0;
    --tw-border-spacing-y: 0;
    --tw-translate-x: 0;
    --tw-translate-y: 0;
    --tw-rotate: 0;
    --tw-skew-x: 0;
    --tw-skew-y: 0;
    --tw-scale-x: 1;
    --tw-scale-y: 1;
    --tw-pan-x: ;
    --tw-pan-y: ;
    --tw-pinch-zoom: ;
    --tw-scroll-snap-strictness: proximity;
    --tw-gradient-from-position: ;
    --tw-gradient-via-position: ;
    --tw-gradient-to-position: ;
    --tw-ordinal: ;
    --tw-slashed-zero: ;
    --tw-numeric-figure: ;
    --tw-numeric-spacing: ;
    --tw-numeric-fraction: ;
    --tw-ring-inset: ;
    --tw-ring-offset-width: 0px;
    --tw-ring-offset-color: #fff;
    --tw-ring-color: rgba(59,130,246,.5);
    --tw-ring-offset-shadow: 0 0 #0000;
    --tw-ring-shadow: 0 0 #0000;
    --tw-shadow: 0 0 #0000;
    --tw-shadow-colored: 0 0 #0000;
    --tw-blur: ;
    --tw-brightness: ;
    --tw-contrast: ;
    --tw-grayscale: ;
    --tw-hue-rotate: ;
    --tw-invert: ;
    --tw-saturate: ;
    --tw-sepia: ;
    --tw-drop-shadow: ;
    --tw-backdrop-blur: ;
    --tw-backdrop-brightness: ;
    --tw-backdrop-contrast: ;
    --tw-backdrop-grayscale: ;
    --tw-backdrop-hue-rotate: ;
    --tw-backdrop-invert: ;
    --tw-backdrop-opacity: ;
    --tw-backdrop-saturate: ;
    --tw-backdrop-sepia:
}

::backdrop {
    --tw-border-spacing-x: 0;
    --tw-border-spacing-y: 0;
    --tw-translate-x: 0;
    --tw-translate-y: 0;
    --tw-rotate: 0;
    --tw-skew-x: 0;
    --tw-skew-y: 0;
    --tw-scale-x: 1;
    --tw-scale-y: 1;
    --tw-pan-x: ;
    --tw-pan-y: ;
    --tw-pinch-zoom: ;
    --tw-scroll-snap-strictness: proximity;
    --tw-gradient-from-position: ;
    --tw-gradient-via-position: ;
    --tw-gradient-to-position: ;
    --tw-ordinal: ;
    --tw-slashed-zero: ;
    --tw-numeric-figure: ;
    --tw-numeric-spacing: ;
    --tw-numeric-fraction: ;
    --tw-ring-inset: ;
    --tw-ring-offset-width: 0px;
    --tw-ring-offset-color: #fff;
    --tw-ring-color: rgba(59,130,246,.5);
    --tw-ring-offset-shadow: 0 0 #0000;
    --tw-ring-shadow: 0 0 #0000;
    --tw-shadow: 0 0 #0000;
    --tw-shadow-colored: 0 0 #0000;
    --tw-blur: ;
    --tw-brightness: ;
    --tw-contrast: ;
    --tw-grayscale: ;
    --tw-hue-rotate: ;
    --tw-invert: ;
    --tw-saturate: ;
    --tw-sepia: ;
    --tw-drop-shadow: ;
    --tw-backdrop-blur: ;
    --tw-backdrop-brightness: ;
    --tw-backdrop-contrast: ;
    --tw-backdrop-grayscale: ;
    --tw-backdrop-hue-rotate: ;
    --tw-backdrop-invert: ;
    --tw-backdrop-opacity: ;
    --tw-backdrop-saturate: ;
    --tw-backdrop-sepia:
}

.container {
    width: 100%;
    margin-right: auto;
    margin-left: auto
}

@media (min-width: 640px) {
    .container {
        max-width:640px
    }
}

@media (min-width: 768px) {
    .container {
        max-width:768px
    }
}

@media (min-width: 1024px) {
    .container {
        max-width:1024px
    }
}

@media (min-width: 1280px) {
    .container {
        max-width:1280px
    }
}

@media (min-width: 1536px) {
    .container {
        max-width:1536px
    }
}

.alert {
    display: grid;
    width: 100%;
    grid-auto-flow: row;
    align-content: flex-start;
    align-items: center;
    justify-items: center;
    gap: 1rem;
    text-align: center;
    border-radius: var(--rounded-box,1rem);
    border-width: 1px;
    --tw-border-opacity: 1;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)));
    padding: 1rem;
    --tw-text-opacity: 1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
    --alert-bg: var(--fallback-b2,oklch(var(--b2)/1));
    --alert-bg-mix: var(--fallback-b1,oklch(var(--b1)/1));
    background-color: var(--alert-bg)
}

@media (min-width: 640px) {
    .alert {
        grid-auto-flow:column;
        grid-template-columns: auto minmax(auto,1fr);
        justify-items: start;
        text-align: start
    }
}

.avatar {
    position: relative;
    display: inline-flex
}

.avatar>div {
    display: block;
    aspect-ratio: 1/1;
    overflow: hidden
}

.avatar img {
    height: 100%;
    width: 100%;
    -o-object-fit: cover;
    object-fit: cover
}

.avatar.placeholder>div {
    display: flex;
    align-items: center;
    justify-content: center
}

.badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-timing-function: cubic-bezier(0,0,.2,1);
    transition-duration: .2s;
    height: 1.25rem;
    font-size: .875rem;
    line-height: 1.25rem;
    width: -moz-fit-content;
    width: fit-content;
    padding-left: .563rem;
    padding-right: .563rem;
    border-radius: var(--rounded-badge,1.9rem);
    border-width: 1px;
    --tw-border-opacity: 1;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)));
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)));
    --tw-text-opacity: 1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)))
}

.breadcrumbs {
    max-width: 100%;
    overflow-x: auto;
    padding-top: .5rem;
    padding-bottom: .5rem
}

.breadcrumbs>ol,.breadcrumbs>ul {
    display: flex;
    align-items: center;
    white-space: nowrap;
    min-height: -moz-min-content;
    min-height: min-content
}

.breadcrumbs>ol>li,.breadcrumbs>ul>li {
    display: flex;
    align-items: center
}

.breadcrumbs>ol>li>a,.breadcrumbs>ul>li>a {
    display: flex;
    cursor: pointer;
    align-items: center
}

@media (hover: hover) {
    .breadcrumbs>ol>li>a:hover,.breadcrumbs>ul>li>a:hover {
        text-decoration-line:underline
    }

    .label a:hover {
        --tw-text-opacity: 1;
        color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)))
    }

    .menu li>:not(ul):not(.menu-title):not(details).active,.menu li>:not(ul):not(.menu-title):not(details):active,.menu li>details>summary:active {
        --tw-bg-opacity: 1;
        background-color: var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));
        --tw-text-opacity: 1;
        color: var(--fallback-nc,oklch(var(--nc)/var(--tw-text-opacity)))
    }

    .tab:hover {
        --tw-text-opacity: 1
    }
}

.btn {
    display: inline-flex;
    height: 3rem;
    min-height: 3rem;
    flex-shrink: 0;
    cursor: pointer;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    border-radius: var(--rounded-btn,.5rem);
    border-color: transparent;
    border-color: oklch(var(--btn-color,var(--b2))/var(--tw-border-opacity));
    padding-left: 1rem;
    padding-right: 1rem;
    text-align: center;
    font-size: .875rem;
    line-height: 1em;
    gap: .5rem;
    font-weight: 600;
    text-decoration-line: none;
    transition-duration: .2s;
    transition-timing-function: cubic-bezier(0,0,.2,1);
    border-width: var(--border-btn,1px);
    animation: button-pop var(--animation-btn,.25s) ease-out;
    transition-property: color,background-color,border-color,opacity,box-shadow,transform;
    --tw-text-opacity: 1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
    --tw-shadow: 0 1px 2px 0 rgba(0,0,0,.05);
    --tw-shadow-colored: 0 1px 2px 0 var(--tw-shadow-color);
    box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow);
    outline-color: var(--fallback-bc,oklch(var(--bc)/1));
    background-color: oklch(var(--btn-color,var(--b2))/var(--tw-bg-opacity));
    --tw-bg-opacity: 1;
    --tw-border-opacity: 1
}

.btn-disabled,.btn:disabled,.btn[disabled] {
    pointer-events: none
}

.btn-circle,.btn-square {
    height: 3rem;
    width: 3rem;
    padding: 0
}

.btn-circle {
    border-radius: 9999px
}

:where(.btn:is(input[type=checkbox])),:where(.btn:is(input[type=radio])) {
    width: auto;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none
}

.btn:is(input[type=checkbox]):after,.btn:is(input[type=radio]):after {
    --tw-content: attr(aria-label);
    content: var(--tw-content)
}

.card {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: var(--rounded-box,1rem)
}

.card:focus {
    outline: 2px solid transparent;
    outline-offset: 2px
}

.card-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: .5rem
}

.card figure {
    display: flex;
    align-items: center;
    justify-content: center
}

.card.image-full {
    display: grid
}

.card.image-full:before {
    position: relative;
    content: "";
    z-index: 10;
    border-radius: var(--rounded-box,1rem);
    --tw-bg-opacity: 1;
    background-color: var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));
    opacity: .75
}

.card.image-full:before,.card.image-full>* {
    grid-column-start: 1;
    grid-row-start: 1
}

.card.image-full>figure img {
    height: 100%;
    -o-object-fit: cover;
    object-fit: cover
}

.card.image-full>.card-body {
    position: relative;
    z-index: 20;
    --tw-text-opacity: 1;
    color: var(--fallback-nc,oklch(var(--nc)/var(--tw-text-opacity)))
}

.carousel {
    display: inline-flex;
    overflow-x: scroll;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    -ms-overflow-style: none;
    scrollbar-width: none
}

.carousel-item {
    box-sizing: content-box;
    display: flex;
    flex: none;
    scroll-snap-align: start
}

.carousel-center .carousel-item {
    scroll-snap-align: center
}

.carousel-end .carousel-item {
    scroll-snap-align: end
}

.\!checkbox {
    flex-shrink: 0!important;
    --chkbg: var(--fallback-bc,oklch(var(--bc)/1))!important;
    --chkfg: var(--fallback-b1,oklch(var(--b1)/1))!important;
    height: 1.5rem!important;
    width: 1.5rem!important;
    cursor: pointer!important;
    -webkit-appearance: none!important;
    -moz-appearance: none!important;
    appearance: none!important;
    border-radius: var(--rounded-btn,.5rem)!important;
    border-width: 1px!important;
    border-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)))!important;
    --tw-border-opacity: 0.2!important
}

.checkbox {
    flex-shrink: 0;
    --chkbg: var(--fallback-bc,oklch(var(--bc)/1));
    --chkfg: var(--fallback-b1,oklch(var(--b1)/1));
    height: 1.5rem;
    width: 1.5rem;
    cursor: pointer;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    border-radius: var(--rounded-btn,.5rem);
    border-width: 1px;
    border-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));
    --tw-border-opacity: 0.2
}

.collapse:not(td):not(tr):not(colgroup) {
    visibility: visible
}

.collapse {
    position: relative;
    display: grid;
    overflow: hidden;
    grid-template-rows: auto 0fr;
    transition: grid-template-rows .2s;
    width: 100%;
    border-radius: var(--rounded-box,1rem)
}

.collapse-content,.collapse-title,.collapse>input[type=checkbox],.collapse>input[type=radio] {
    grid-column-start: 1;
    grid-row-start: 1
}

.collapse>input[type=checkbox],.collapse>input[type=radio] {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    opacity: 0
}

.collapse-content {
    visibility: hidden;
    grid-column-start: 1;
    grid-row-start: 2;
    min-height: 0;
    transition: visibility .2s;
    transition: padding .2s ease-out,background-color .2s ease-out;
    padding-left: 1rem;
    padding-right: 1rem;
    cursor: unset
}

.collapse-open,.collapse:focus:not(.collapse-close),.collapse[open] {
    grid-template-rows: auto 1fr
}

.collapse:not(.collapse-close):has(>input[type=checkbox]:checked),.collapse:not(.collapse-close):has(>input[type=radio]:checked) {
    grid-template-rows: auto 1fr
}

.collapse-open>.collapse-content,.collapse:focus:not(.collapse-close)>.collapse-content,.collapse:not(.collapse-close)>input[type=checkbox]:checked~.collapse-content,.collapse:not(.collapse-close)>input[type=radio]:checked~.collapse-content,.collapse[open]>.collapse-content {
    visibility: visible;
    min-height: -moz-fit-content;
    min-height: fit-content
}

:root .countdown {
    line-height: 1em
}

.countdown {
    display: inline-flex
}

.countdown>* {
    height: 1em;
    display: inline-block;
    overflow-y: hidden
}

.countdown>:before {
    position: relative;
    content: "00\A 01\A 02\A 03\A 04\A 05\A 06\A 07\A 08\A 09\A 10\A 11\A 12\A 13\A 14\A 15\A 16\A 17\A 18\A 19\A 20\A 21\A 22\A 23\A 24\A 25\A 26\A 27\A 28\A 29\A 30\A 31\A 32\A 33\A 34\A 35\A 36\A 37\A 38\A 39\A 40\A 41\A 42\A 43\A 44\A 45\A 46\A 47\A 48\A 49\A 50\A 51\A 52\A 53\A 54\A 55\A 56\A 57\A 58\A 59\A 60\A 61\A 62\A 63\A 64\A 65\A 66\A 67\A 68\A 69\A 70\A 71\A 72\A 73\A 74\A 75\A 76\A 77\A 78\A 79\A 80\A 81\A 82\A 83\A 84\A 85\A 86\A 87\A 88\A 89\A 90\A 91\A 92\A 93\A 94\A 95\A 96\A 97\A 98\A 99\A";
    white-space: pre;
    top: calc(var(--value)*-1em);
    text-align: center;
    transition: all 1s cubic-bezier(1,0,0,1)
}

.divider {
    display: flex;
    flex-direction: row;
    align-items: center;
    align-self: stretch;
    margin-top: 1rem;
    margin-bottom: 1rem;
    height: 1rem;
    white-space: nowrap
}

.divider:after,.divider:before {
    height: .125rem;
    width: 100%;
    flex-grow: 1;
    --tw-content: "";
    content: var(--tw-content);
    background-color: var(--fallback-bc,oklch(var(--bc)/.1))
}

.drawer {
    position: relative;
    display: grid;
    grid-auto-columns: max-content auto;
    width: 100%
}

.drawer-content {
    grid-column-start: 2;
    grid-row-start: 1;
    min-width: 0
}

.drawer-side {
    pointer-events: none;
    position: fixed;
    inset-inline-start: 0;
    top: 0;
    grid-column-start: 1;
    grid-row-start: 1;
    display: grid;
    width: 100%;
    grid-template-columns: repeat(1,minmax(0,1fr));
    grid-template-rows: repeat(1,minmax(0,1fr));
    align-items: flex-start;
    justify-items: start;
    overflow-y: auto;
    overscroll-behavior: contain;
    height: 100vh;
    height: 100dvh
}

.drawer-side>.drawer-overlay {
    position: sticky;
    top: 0;
    place-self: stretch;
    cursor: pointer;
    background-color: transparent;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-timing-function: cubic-bezier(0,0,.2,1);
    transition-duration: .2s
}

.drawer-side>* {
    grid-column-start: 1;
    grid-row-start: 1
}

.drawer-side>:not(.drawer-overlay) {
    transition-property: transform;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-timing-function: cubic-bezier(0,0,.2,1);
    transition-duration: .3s;
    will-change: transform;
    transform: translateX(-100%)
}

[dir=rtl] .drawer-side>:not(.drawer-overlay) {
    transform: translateX(100%)
}

.drawer-toggle {
    position: fixed;
    height: 0;
    width: 0;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    opacity: 0
}

.drawer-toggle:checked~.drawer-side {
    pointer-events: auto;
    visibility: visible
}

.drawer-toggle:checked~.drawer-side>:not(.drawer-overlay) {
    transform: translateX(0)
}

.drawer-end {
    grid-auto-columns: auto max-content
}

.drawer-end .drawer-toggle~.drawer-content {
    grid-column-start: 1
}

.drawer-end .drawer-toggle~.drawer-side {
    grid-column-start: 2;
    justify-items: end
}

.drawer-end .drawer-toggle~.drawer-side>:not(.drawer-overlay) {
    transform: translateX(100%)
}

[dir=rtl] .drawer-end .drawer-toggle~.drawer-side>:not(.drawer-overlay) {
    transform: translateX(-100%)
}

.drawer-end .drawer-toggle:checked~.drawer-side>:not(.drawer-overlay) {
    transform: translateX(0)
}

@media (hover: hover) {
    .btm-nav>.disabled:hover,.btm-nav>[disabled]:hover {
        pointer-events:none;
        --tw-border-opacity: 0;
        background-color: var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));
        --tw-bg-opacity: 0.1;
        color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
        --tw-text-opacity: 0.2
    }

    .btn:hover {
        --tw-border-opacity: 1;
        border-color: var(--fallback-b3,oklch(var(--b3)/var(--tw-border-opacity)));
        --tw-bg-opacity: 1;
        background-color: var(--fallback-b3,oklch(var(--b3)/var(--tw-bg-opacity)))
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn:hover {
            background-color:color-mix(in oklab,oklch(var(--btn-color,var(--b2))/var(--tw-bg-opacity,1)) 90%,#000);
            border-color: color-mix(in oklab,oklch(var(--btn-color,var(--b2))/var(--tw-border-opacity,1)) 90%,#000)
        }
    }

    @supports not (color: oklch(0 0 0)) {
        .btn:hover {
            background-color:var(--btn-color,var(--fallback-b2));
            border-color: var(--btn-color,var(--fallback-b2))
        }
    }

    .btn.glass:hover {
        --glass-opacity: 25%;
        --glass-border-opacity: 15%
    }

    .btn-ghost:hover {
        border-color: transparent
    }

    @supports (color: oklch(0 0 0)) {
        .btn-ghost:hover {
            background-color:var(--fallback-bc,oklch(var(--bc)/.2))
        }
    }

    .btn-link:hover {
        border-color: transparent;
        background-color: transparent;
        text-decoration-line: underline
    }

    .btn-outline:hover {
        --tw-border-opacity: 1;
        border-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));
        --tw-bg-opacity: 1;
        background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));
        --tw-text-opacity: 1;
        color: var(--fallback-b1,oklch(var(--b1)/var(--tw-text-opacity)))
    }

    .btn-outline.btn-primary:hover {
        --tw-text-opacity: 1;
        color: var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)))
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn-outline.btn-primary:hover {
            background-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000);
            border-color: color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000)
        }
    }

    .btn-outline.btn-secondary:hover {
        --tw-text-opacity: 1;
        color: var(--fallback-sc,oklch(var(--sc)/var(--tw-text-opacity)))
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn-outline.btn-secondary:hover {
            background-color:color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 90%,#000);
            border-color: color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 90%,#000)
        }
    }

    .btn-outline.btn-accent:hover {
        --tw-text-opacity: 1;
        color: var(--fallback-ac,oklch(var(--ac)/var(--tw-text-opacity)))
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn-outline.btn-accent:hover {
            background-color:color-mix(in oklab,var(--fallback-a,oklch(var(--a)/1)) 90%,#000);
            border-color: color-mix(in oklab,var(--fallback-a,oklch(var(--a)/1)) 90%,#000)
        }
    }

    .btn-outline.btn-success:hover {
        --tw-text-opacity: 1;
        color: var(--fallback-suc,oklch(var(--suc)/var(--tw-text-opacity)))
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn-outline.btn-success:hover {
            background-color:color-mix(in oklab,var(--fallback-su,oklch(var(--su)/1)) 90%,#000);
            border-color: color-mix(in oklab,var(--fallback-su,oklch(var(--su)/1)) 90%,#000)
        }
    }

    .btn-outline.btn-info:hover {
        --tw-text-opacity: 1;
        color: var(--fallback-inc,oklch(var(--inc)/var(--tw-text-opacity)))
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn-outline.btn-info:hover {
            background-color:color-mix(in oklab,var(--fallback-in,oklch(var(--in)/1)) 90%,#000);
            border-color: color-mix(in oklab,var(--fallback-in,oklch(var(--in)/1)) 90%,#000)
        }
    }

    .btn-outline.btn-warning:hover {
        --tw-text-opacity: 1;
        color: var(--fallback-wac,oklch(var(--wac)/var(--tw-text-opacity)))
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn-outline.btn-warning:hover {
            background-color:color-mix(in oklab,var(--fallback-wa,oklch(var(--wa)/1)) 90%,#000);
            border-color: color-mix(in oklab,var(--fallback-wa,oklch(var(--wa)/1)) 90%,#000)
        }
    }

    .btn-outline.btn-error:hover {
        --tw-text-opacity: 1;
        color: var(--fallback-erc,oklch(var(--erc)/var(--tw-text-opacity)))
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn-outline.btn-error:hover {
            background-color:color-mix(in oklab,var(--fallback-er,oklch(var(--er)/1)) 90%,#000);
            border-color: color-mix(in oklab,var(--fallback-er,oklch(var(--er)/1)) 90%,#000)
        }
    }

    .btn-disabled:hover,.btn:disabled:hover,.btn[disabled]:hover {
        --tw-border-opacity: 0;
        background-color: var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));
        --tw-bg-opacity: 0.2;
        color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
        --tw-text-opacity: 0.2
    }

    @supports (color: color-mix(in oklab,black,black)) {
        .btn:is(input[type=checkbox]:checked):hover,.btn:is(input[type=radio]:checked):hover {
            background-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000);
            border-color: color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000)
        }
    }

    :where(.menu li:not(.menu-title):not(.disabled)>:not(ul):not(details):not(.menu-title)):not(.active):hover,:where(.menu li:not(.menu-title):not(.disabled)>details>summary:not(.menu-title)):not(.active):hover {
        cursor: pointer;
        outline: 2px solid transparent;
        outline-offset: 2px
    }

    @supports (color: oklch(0 0 0)) {
        :where(.menu li:not(.menu-title):not(.disabled)>:not(ul):not(details):not(.menu-title)):not(.active):hover,:where(.menu li:not(.menu-title):not(.disabled)>details>summary:not(.menu-title)):not(.active):hover {
            background-color:var(--fallback-bc,oklch(var(--bc)/.1))
        }
    }

    .tab[disabled],.tab[disabled]:hover {
        cursor: not-allowed;
        color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
        --tw-text-opacity: 0.2
    }
}

.footer {
    width: 100%;
    grid-auto-flow: row;
    -moz-column-gap: 1rem;
    column-gap: 1rem;
    row-gap: 2.5rem;
    font-size: .875rem;
    line-height: 1.25rem
}

.footer,.footer>* {
    display: grid;
    place-items: start
}

.footer>* {
    gap: .5rem
}

@media (min-width: 48rem) {
    .footer {
        grid-auto-flow:column
    }

    .footer-center {
        grid-auto-flow: row dense
    }
}

.form-control {
    flex-direction: column
}

.form-control,.label {
    display: flex
}

.label {
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
    align-items: center;
    justify-content: space-between;
    padding: .5rem .25rem
}

.indicator {
    position: relative;
    display: inline-flex;
    width: -moz-max-content;
    width: max-content
}

.indicator :where(.indicator-item) {
    z-index: 1;
    position: absolute;
    white-space: nowrap
}

.\!input {
    flex-shrink: 1!important;
    -webkit-appearance: none!important;
    -moz-appearance: none!important;
    appearance: none!important;
    height: 3rem!important;
    padding-left: 1rem!important;
    padding-right: 1rem!important;
    font-size: 1rem!important;
    line-height: 2!important;
    line-height: 1.5rem!important;
    border-radius: var(--rounded-btn,.5rem)!important;
    border-width: 1px!important;
    border-color: transparent!important;
    --tw-bg-opacity: 1!important;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))!important
}

.input {
    flex-shrink: 1;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    height: 3rem;
    padding-left: 1rem;
    padding-right: 1rem;
    font-size: 1rem;
    line-height: 2;
    line-height: 1.5rem;
    border-radius: var(--rounded-btn,.5rem);
    border-width: 1px;
    border-color: transparent;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))
}

.join {
    display: inline-flex;
    align-items: stretch;
    border-radius: var(--rounded-btn,.5rem)
}

.join :where(.join-item) {
    border-start-end-radius: 0;
    border-end-end-radius: 0;
    border-end-start-radius: 0;
    border-start-start-radius: 0
}

.join .join-item:not(:first-child):not(:last-child),.join :not(:first-child):not(:last-child) .join-item {
    border-start-end-radius: 0;
    border-end-end-radius: 0;
    border-end-start-radius: 0;
    border-start-start-radius: 0
}

.join .join-item:first-child:not(:last-child),.join :first-child:not(:last-child) .join-item {
    border-start-end-radius: 0;
    border-end-end-radius: 0
}

.join .dropdown .join-item:first-child:not(:last-child),.join :first-child:not(:last-child) .dropdown .join-item {
    border-start-end-radius: inherit;
    border-end-end-radius: inherit
}

.join :where(.join-item:first-child:not(:last-child)),.join :where(:first-child:not(:last-child) .join-item) {
    border-end-start-radius: inherit;
    border-start-start-radius: inherit
}

.join .join-item:last-child:not(:first-child),.join :last-child:not(:first-child) .join-item {
    border-end-start-radius: 0;
    border-start-start-radius: 0
}

.join :where(.join-item:last-child:not(:first-child)),.join :where(:last-child:not(:first-child) .join-item) {
    border-start-end-radius: inherit;
    border-end-end-radius: inherit
}

@supports not selector(:has(*)) {
    :where(.join *) {
        border-radius: inherit
    }
}

@supports selector(:has(*)) {
    :where(.join :has(.join-item)) {
        border-radius: inherit
    }
}

.link {
    cursor: pointer;
    text-decoration-line: underline
}

.mask {
    -webkit-mask-size: contain;
    mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center
}

.menu {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    font-size: .875rem;
    line-height: 1.25rem;
    padding: .5rem
}

.menu :where(li ul) {
    position: relative;
    white-space: nowrap;
    margin-inline-start:1rem;padding-inline-start:.5rem}

.menu :where(li:not(.menu-title)>:not(ul):not(details):not(.menu-title)),.menu :where(li:not(.menu-title)>details>summary:not(.menu-title)) {
    display: grid;
    grid-auto-flow: column;
    align-content: flex-start;
    align-items: center;
    gap: .5rem;
    grid-auto-columns: minmax(auto,max-content) auto max-content;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none
}

.menu li.disabled {
    cursor: not-allowed;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
    color: var(--fallback-bc,oklch(var(--bc)/.3))
}

.menu :where(li>.menu-dropdown:not(.menu-dropdown-show)) {
    display: none
}

:where(.menu li) {
    position: relative;
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    flex-wrap: wrap;
    align-items: stretch
}

:where(.menu li) .badge {
    justify-self: end
}

.modal {
    pointer-events: none;
    position: fixed;
    inset: 0;
    margin: 0;
    display: grid;
    height: 100%;
    max-height: none;
    width: 100%;
    max-width: none;
    justify-items: center;
    padding: 0;
    opacity: 0;
    overscroll-behavior: contain;
    z-index: 999;
    background-color: transparent;
    color: inherit;
    transition-duration: .2s;
    transition-timing-function: cubic-bezier(0,0,.2,1);
    transition-property: transform,opacity,visibility;
    overflow-y: hidden
}

:where(.modal) {
    align-items: center
}

.modal-box {
    max-height: calc(100vh - 5em);
    grid-column-start: 1;
    grid-row-start: 1;
    width: 91.666667%;
    max-width: 32rem;
    --tw-scale-x: .9;
    --tw-scale-y: .9;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    border-bottom-right-radius: var(--rounded-box,1rem);
    border-bottom-left-radius: var(--rounded-box,1rem);
    border-top-left-radius: var(--rounded-box,1rem);
    border-top-right-radius: var(--rounded-box,1rem);
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)));
    padding: 1.5rem;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-timing-function: cubic-bezier(0,0,.2,1);
    transition-duration: .2s;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,.25);
    overflow-y: auto;
    overscroll-behavior: contain
}

.modal-open,.modal-toggle:checked+.modal,.modal:target,.modal[open] {
    pointer-events: auto;
    visibility: visible;
    opacity: 1
}

.modal-toggle {
    position: fixed;
    height: 0;
    width: 0;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    opacity: 0
}

:root:has(:is(.modal-open,.modal:target,.modal-toggle:checked+.modal,.modal[open])) {
    overflow: hidden
}

.progress {
    position: relative;
    width: 100%;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    overflow: hidden;
    height: .5rem;
    border-radius: var(--rounded-box,1rem);
    background-color: var(--fallback-bc,oklch(var(--bc)/.2))
}

.radio {
    flex-shrink: 0;
    --chkbg: var(--bc);
    width: 1.5rem;
    -webkit-appearance: none;
    border-radius: 9999px;
    border-width: 1px;
    border-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));
    --tw-border-opacity: 0.2
}

.radio,.range {
    height: 1.5rem;
    cursor: pointer;
    -moz-appearance: none;
    appearance: none
}

.range {
    width: 100%;
    -webkit-appearance: none;
    --range-shdw: var(--fallback-bc,oklch(var(--bc)/1));
    overflow: hidden;
    border-radius: var(--rounded-box,1rem);
    background-color: transparent
}

.range:focus {
    outline: none
}

.select {
    display: inline-flex;
    cursor: pointer;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    height: 3rem;
    min-height: 3rem;
    padding-left: 1rem;
    padding-right: 2.5rem;
    font-size: .875rem;
    line-height: 1.25rem;
    line-height: 2;
    border-radius: var(--rounded-btn,.5rem);
    border-width: 1px;
    border-color: transparent;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)));
    background-image: linear-gradient(45deg,transparent 50%,currentColor 0),linear-gradient(135deg,currentColor 50%,transparent 0);
    background-position: calc(100% - 20px) calc(1px + 50%),calc(100% - 16.1px) calc(1px + 50%);
    background-size: 4px 4px,4px 4px;
    background-repeat: no-repeat
}

.select[multiple] {
    height: auto
}

.stack {
    display: inline-grid;
    place-items: center;
    align-items: flex-end
}

.stack>* {
    grid-column-start: 1;
    grid-row-start: 1;
    transform: translateY(10%) scale(.9);
    z-index: 1;
    width: 100%;
    opacity: .6
}

.stack>:nth-child(2) {
    transform: translateY(5%) scale(.95);
    z-index: 2;
    opacity: .8
}

.stack>:first-child {
    transform: translateY(0) scale(1);
    z-index: 3;
    opacity: 1
}

.tabs {
    display: grid;
    align-items: flex-end
}

.tabs-lifted:has(.tab-content[class*=" rounded-"]) .tab:first-child:not(.tab-active),.tabs-lifted:has(.tab-content[class^=rounded-]) .tab:first-child:not(.tab-active) {
    border-bottom-color: transparent
}

.tab {
    position: relative;
    grid-row-start: 1;
    display: inline-flex;
    height: 2rem;
    cursor: pointer;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: .875rem;
    line-height: 1.25rem;
    line-height: 2;
    --tab-padding: 1rem;
    --tw-text-opacity: 0.5;
    --tab-color: var(--fallback-bc,oklch(var(--bc)/1));
    --tab-bg: var(--fallback-b1,oklch(var(--b1)/1));
    --tab-border-color: var(--fallback-b3,oklch(var(--b3)/1));
    color: var(--tab-color);
    padding-inline-start:var(--tab-padding,1rem);padding-inline-end: var(--tab-padding,1rem)
}

.tab:is(input[type=radio]) {
    width: auto;
    border-bottom-right-radius: 0;
    border-bottom-left-radius: 0
}

.tab:is(input[type=radio]):after {
    --tw-content: attr(aria-label);
    content: var(--tw-content)
}

.tab:not(input):empty {
    cursor: default;
    grid-column-start: span 9999
}

.tab-active+.tab-content,input.tab:checked+.tab-content {
    display: block
}

.textarea {
    min-height: 3rem;
    flex-shrink: 1;
    padding: .5rem 1rem;
    font-size: .875rem;
    line-height: 1.25rem;
    line-height: 2;
    border-radius: var(--rounded-btn,.5rem);
    border-width: 1px;
    border-color: transparent;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))
}

.toggle {
    flex-shrink: 0;
    --tglbg: var(--fallback-b1,oklch(var(--b1)/1));
    --handleoffset: 1.5rem;
    --handleoffsetcalculator: calc(var(--handleoffset)*-1);
    --togglehandleborder: 0 0;
    height: 1.5rem;
    width: 3rem;
    cursor: pointer;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    border-radius: var(--rounded-badge,1.9rem);
    border-width: 1px;
    border-color: currentColor;
    background-color: currentColor;
    color: var(--fallback-bc,oklch(var(--bc)/.5));
    transition: background,box-shadow var(--animation-input,.2s) ease-out;
    box-shadow: var(--handleoffsetcalculator) 0 0 2px var(--tglbg) inset,0 0 0 2px var(--tglbg) inset,var(--togglehandleborder)
}

.avatar-group :where(.avatar) {
    overflow: hidden;
    border-radius: 9999px;
    border-width: 4px;
    --tw-border-opacity: 1;
    border-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-border-opacity)))
}

.badge-primary {
    --tw-border-opacity: 1;
    border-color: var(--fallback-p,oklch(var(--p)/var(--tw-border-opacity)));
    --tw-bg-opacity: 1;
    background-color: var(--fallback-p,oklch(var(--p)/var(--tw-bg-opacity)));
    --tw-text-opacity: 1;
    color: var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)))
}

.badge-outline.badge-primary {
    --tw-text-opacity: 1;
    color: var(--fallback-p,oklch(var(--p)/var(--tw-text-opacity)))
}

.btm-nav>:where(.active) {
    border-top-width: 2px;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))
}

.btm-nav>.disabled,.btm-nav>[disabled] {
    pointer-events: none;
    --tw-border-opacity: 0;
    background-color: var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));
    --tw-bg-opacity: 0.1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
    --tw-text-opacity: 0.2
}

.btm-nav>* .label {
    font-size: 1rem;
    line-height: 1.5rem
}

.breadcrumbs>ol>li>a:focus,.breadcrumbs>ul>li>a:focus {
    outline: 2px solid transparent;
    outline-offset: 2px
}

.breadcrumbs>ol>li>a:focus-visible,.breadcrumbs>ul>li>a:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px
}

.breadcrumbs>ol>li+:before,.breadcrumbs>ul>li+:before {
    content: "";
    margin-left: .5rem;
    margin-right: .75rem;
    display: block;
    height: .375rem;
    width: .375rem;
    --tw-rotate: 45deg;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    opacity: .4;
    border-top: 1px solid;
    border-right: 1px solid;
    background-color: transparent
}

[dir=rtl] .breadcrumbs>ol>li+:before,[dir=rtl] .breadcrumbs>ul>li+:before {
    --tw-rotate: -135deg
}

.btn:active:focus,.btn:active:hover {
    animation: button-pop 0s ease-out;
    transform: scale(var(--btn-focus-scale,.97))
}

@supports not (color: oklch(0 0 0)) {
    .btn {
        background-color:var(--btn-color,var(--fallback-b2));
        border-color: var(--btn-color,var(--fallback-b2))
    }

    .btn-primary {
        --btn-color: var(--fallback-p)
    }

    .btn-secondary {
        --btn-color: var(--fallback-s)
    }

    .btn-accent {
        --btn-color: var(--fallback-a)
    }

    .btn-neutral {
        --btn-color: var(--fallback-n)
    }

    .btn-error {
        --btn-color: var(--fallback-er)
    }
}

@supports (color: color-mix(in oklab,black,black)) {
    .btn-outline.btn-primary.btn-active {
        background-color:color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000);
        border-color: color-mix(in oklab,var(--fallback-p,oklch(var(--p)/1)) 90%,#000)
    }

    .btn-outline.btn-secondary.btn-active {
        background-color: color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 90%,#000);
        border-color: color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 90%,#000)
    }

    .btn-outline.btn-accent.btn-active {
        background-color: color-mix(in oklab,var(--fallback-a,oklch(var(--a)/1)) 90%,#000);
        border-color: color-mix(in oklab,var(--fallback-a,oklch(var(--a)/1)) 90%,#000)
    }

    .btn-outline.btn-success.btn-active {
        background-color: color-mix(in oklab,var(--fallback-su,oklch(var(--su)/1)) 90%,#000);
        border-color: color-mix(in oklab,var(--fallback-su,oklch(var(--su)/1)) 90%,#000)
    }

    .btn-outline.btn-info.btn-active {
        background-color: color-mix(in oklab,var(--fallback-in,oklch(var(--in)/1)) 90%,#000);
        border-color: color-mix(in oklab,var(--fallback-in,oklch(var(--in)/1)) 90%,#000)
    }

    .btn-outline.btn-warning.btn-active {
        background-color: color-mix(in oklab,var(--fallback-wa,oklch(var(--wa)/1)) 90%,#000);
        border-color: color-mix(in oklab,var(--fallback-wa,oklch(var(--wa)/1)) 90%,#000)
    }

    .btn-outline.btn-error.btn-active {
        background-color: color-mix(in oklab,var(--fallback-er,oklch(var(--er)/1)) 90%,#000);
        border-color: color-mix(in oklab,var(--fallback-er,oklch(var(--er)/1)) 90%,#000)
    }
}

.btn:focus-visible {
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px
}

.btn-primary {
    --tw-text-opacity: 1;
    color: var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)));
    outline-color: var(--fallback-p,oklch(var(--p)/1))
}

@supports (color: oklch(0 0 0)) {
    .btn-primary {
        --btn-color:var(--p)
    }

    .btn-secondary {
        --btn-color: var(--s)
    }

    .btn-accent {
        --btn-color: var(--a)
    }

    .btn-neutral {
        --btn-color: var(--n)
    }

    .btn-error {
        --btn-color: var(--er)
    }
}

.btn-secondary {
    --tw-text-opacity: 1;
    color: var(--fallback-sc,oklch(var(--sc)/var(--tw-text-opacity)));
    outline-color: var(--fallback-s,oklch(var(--s)/1))
}

.btn-accent {
    --tw-text-opacity: 1;
    color: var(--fallback-ac,oklch(var(--ac)/var(--tw-text-opacity)));
    outline-color: var(--fallback-a,oklch(var(--a)/1))
}

.btn-neutral {
    --tw-text-opacity: 1;
    color: var(--fallback-nc,oklch(var(--nc)/var(--tw-text-opacity)));
    outline-color: var(--fallback-n,oklch(var(--n)/1))
}

.btn-error {
    --tw-text-opacity: 1;
    color: var(--fallback-erc,oklch(var(--erc)/var(--tw-text-opacity)));
    outline-color: var(--fallback-er,oklch(var(--er)/1))
}

.btn.glass {
    --tw-shadow: 0 0 #0000;
    --tw-shadow-colored: 0 0 #0000;
    box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow);
    outline-color: currentColor
}

.btn.glass.btn-active {
    --glass-opacity: 25%;
    --glass-border-opacity: 15%
}

.btn-ghost {
    border-width: 1px;
    border-color: transparent;
    background-color: transparent;
    color: currentColor;
    --tw-shadow: 0 0 #0000;
    --tw-shadow-colored: 0 0 #0000;
    box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow);
    outline-color: currentColor
}

.btn-ghost.btn-active {
    border-color: transparent;
    background-color: var(--fallback-bc,oklch(var(--bc)/.2))
}

.btn-link {
    --tw-text-opacity: 1;
    color: var(--fallback-p,oklch(var(--p)/var(--tw-text-opacity)));
    --tw-shadow: 0 0 #0000;
    --tw-shadow-colored: 0 0 #0000;
    box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow);
    outline-color: currentColor
}

.btn-link,.btn-link.btn-active {
    border-color: transparent;
    background-color: transparent;
    text-decoration-line: underline
}

.btn-outline {
    border-color: currentColor;
    background-color: transparent;
    --tw-text-opacity: 1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
    --tw-shadow: 0 0 #0000;
    --tw-shadow-colored: 0 0 #0000;
    box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)
}

.btn-outline.btn-active {
    --tw-border-opacity: 1;
    border-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));
    --tw-bg-opacity: 1;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));
    --tw-text-opacity: 1;
    color: var(--fallback-b1,oklch(var(--b1)/var(--tw-text-opacity)))
}

.btn-outline.btn-primary {
    --tw-text-opacity: 1;
    color: var(--fallback-p,oklch(var(--p)/var(--tw-text-opacity)))
}

.btn-outline.btn-primary.btn-active {
    --tw-text-opacity: 1;
    color: var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)))
}

.btn-outline.btn-secondary {
    --tw-text-opacity: 1;
    color: var(--fallback-s,oklch(var(--s)/var(--tw-text-opacity)))
}

.btn-outline.btn-secondary.btn-active {
    --tw-text-opacity: 1;
    color: var(--fallback-sc,oklch(var(--sc)/var(--tw-text-opacity)))
}

.btn-outline.btn-accent {
    --tw-text-opacity: 1;
    color: var(--fallback-a,oklch(var(--a)/var(--tw-text-opacity)))
}

.btn-outline.btn-accent.btn-active {
    --tw-text-opacity: 1;
    color: var(--fallback-ac,oklch(var(--ac)/var(--tw-text-opacity)))
}

.btn-outline.btn-success {
    --tw-text-opacity: 1;
    color: var(--fallback-su,oklch(var(--su)/var(--tw-text-opacity)))
}

.btn-outline.btn-success.btn-active {
    --tw-text-opacity: 1;
    color: var(--fallback-suc,oklch(var(--suc)/var(--tw-text-opacity)))
}

.btn-outline.btn-info {
    --tw-text-opacity: 1;
    color: var(--fallback-in,oklch(var(--in)/var(--tw-text-opacity)))
}

.btn-outline.btn-info.btn-active {
    --tw-text-opacity: 1;
    color: var(--fallback-inc,oklch(var(--inc)/var(--tw-text-opacity)))
}

.btn-outline.btn-warning {
    --tw-text-opacity: 1;
    color: var(--fallback-wa,oklch(var(--wa)/var(--tw-text-opacity)))
}

.btn-outline.btn-warning.btn-active {
    --tw-text-opacity: 1;
    color: var(--fallback-wac,oklch(var(--wac)/var(--tw-text-opacity)))
}

.btn-outline.btn-error {
    --tw-text-opacity: 1;
    color: var(--fallback-er,oklch(var(--er)/var(--tw-text-opacity)))
}

.btn-outline.btn-error.btn-active {
    --tw-text-opacity: 1;
    color: var(--fallback-erc,oklch(var(--erc)/var(--tw-text-opacity)))
}

.btn.btn-disabled,.btn:disabled,.btn[disabled] {
    --tw-border-opacity: 0;
    background-color: var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));
    --tw-bg-opacity: 0.2;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
    --tw-text-opacity: 0.2
}

.btn:is(input[type=checkbox]:checked),.btn:is(input[type=radio]:checked) {
    --tw-border-opacity: 1;
    border-color: var(--fallback-p,oklch(var(--p)/var(--tw-border-opacity)));
    --tw-bg-opacity: 1;
    background-color: var(--fallback-p,oklch(var(--p)/var(--tw-bg-opacity)));
    --tw-text-opacity: 1;
    color: var(--fallback-pc,oklch(var(--pc)/var(--tw-text-opacity)))
}

.btn:is(input[type=checkbox]:checked):focus-visible,.btn:is(input[type=radio]:checked):focus-visible {
    outline-color: var(--fallback-p,oklch(var(--p)/1))
}

@keyframes button-pop {
    0% {
        transform: scale(var(--btn-focus-scale,.98))
    }

    40% {
        transform: scale(1.02)
    }

    to {
        transform: scale(1)
    }
}

.card :where(figure:first-child) {
    overflow: hidden;
    border-start-start-radius: inherit;
    border-start-end-radius: inherit;
    border-end-start-radius: unset;
    border-end-end-radius: unset
}

.card :where(figure:last-child) {
    overflow: hidden;
    border-start-start-radius: unset;
    border-start-end-radius: unset;
    border-end-start-radius: inherit;
    border-end-end-radius: inherit
}

.card:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px
}

.card.bordered {
    border-width: 1px;
    --tw-border-opacity: 1;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)))
}

.card.compact .card-body {
    padding: 1rem;
    font-size: .875rem;
    line-height: 1.25rem
}

.card-title {
    display: flex;
    align-items: center;
    gap: .5rem;
    font-size: 1.25rem;
    line-height: 1.75rem;
    font-weight: 600
}

.card.image-full :where(figure) {
    overflow: hidden;
    border-radius: inherit
}

.carousel::-webkit-scrollbar {
    display: none
}

.\!checkbox:focus {
    box-shadow: none!important
}

.checkbox:focus {
    box-shadow: none
}

.\!checkbox:focus-visible {
    outline-style: solid!important;
    outline-width: 2px!important;
    outline-offset: 2px!important;
    outline-color: var(--fallback-bc,oklch(var(--bc)/1))!important
}

.checkbox:focus-visible {
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px;
    outline-color: var(--fallback-bc,oklch(var(--bc)/1))
}

.checkbox:checked,.checkbox[aria-checked=true],.checkbox[checked=true] {
    background-repeat: no-repeat;
    animation: checkmark var(--animation-input,.2s) ease-out;
    background-color: var(--chkbg);
    background-image: linear-gradient(-45deg,transparent 65%,var(--chkbg) 65.99%),linear-gradient(45deg,transparent 75%,var(--chkbg) 75.99%),linear-gradient(-45deg,var(--chkbg) 40%,transparent 40.99%),linear-gradient(45deg,var(--chkbg) 30%,var(--chkfg) 30.99%,var(--chkfg) 40%,transparent 40.99%),linear-gradient(-45deg,var(--chkfg) 50%,var(--chkbg) 50.99%)
}

.\!checkbox:checked,.\!checkbox[aria-checked=true],.\!checkbox[checked=true] {
    background-repeat: no-repeat!important;
    animation: checkmark var(--animation-input,.2s) ease-out!important;
    background-color: var(--chkbg)!important;
    background-image: linear-gradient(-45deg,transparent 65%,var(--chkbg) 65.99%),linear-gradient(45deg,transparent 75%,var(--chkbg) 75.99%),linear-gradient(-45deg,var(--chkbg) 40%,transparent 40.99%),linear-gradient(45deg,var(--chkbg) 30%,var(--chkfg) 30.99%,var(--chkfg) 40%,transparent 40.99%),linear-gradient(-45deg,var(--chkfg) 50%,var(--chkbg) 50.99%)!important
}

.\!checkbox:indeterminate {
    --tw-bg-opacity: 1!important;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)))!important;
    background-repeat: no-repeat!important;
    animation: checkmark var(--animation-input,.2s) ease-out!important;
    background-image: linear-gradient(90deg,transparent 80%,var(--chkbg) 80%),linear-gradient(-90deg,transparent 80%,var(--chkbg) 80%),linear-gradient(0deg,var(--chkbg) 43%,var(--chkfg) 43%,var(--chkfg) 57%,var(--chkbg) 57%)!important
}

.checkbox:indeterminate {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));
    background-repeat: no-repeat;
    animation: checkmark var(--animation-input,.2s) ease-out;
    background-image: linear-gradient(90deg,transparent 80%,var(--chkbg) 80%),linear-gradient(-90deg,transparent 80%,var(--chkbg) 80%),linear-gradient(0deg,var(--chkbg) 43%,var(--chkfg) 43%,var(--chkfg) 57%,var(--chkbg) 57%)
}

.\!checkbox:disabled {
    cursor: not-allowed!important;
    border-color: transparent!important;
    --tw-bg-opacity: 1!important;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)))!important;
    opacity: .2!important
}

.checkbox:disabled {
    cursor: not-allowed;
    border-color: transparent;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));
    opacity: .2
}

@keyframes checkmark {
    0% {
        background-position-y: 5px
    }

    50% {
        background-position-y: -2px
    }

    to {
        background-position-y: 0
    }
}

details.collapse {
    width: 100%
}

details.collapse summary {
    position: relative;
    display: block;
    outline: 2px solid transparent;
    outline-offset: 2px
}

details.collapse summary::-webkit-details-marker {
    display: none
}

.collapse:focus-visible {
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px;
    outline-color: var(--fallback-bc,oklch(var(--bc)/1))
}

.collapse:has(.collapse-title:focus-visible),.collapse:has(>input[type=checkbox]:focus-visible),.collapse:has(>input[type=radio]:focus-visible) {
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px;
    outline-color: var(--fallback-bc,oklch(var(--bc)/1))
}

.collapse-arrow>.collapse-title:after {
    --tw-translate-y: -100%;
    --tw-rotate: 45deg;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-timing-function: cubic-bezier(0,0,.2,1);
    transition-duration: .15s;
    transition-duration: .2s;
    top: 1.9rem;
    content: "";
    transform-origin: 75% 75%;
    box-shadow: 2px 2px
}

.collapse-arrow>.collapse-title:after,.collapse-plus>.collapse-title:after {
    position: absolute;
    display: block;
    height: .5rem;
    width: .5rem;
    transition-property: all;
    inset-inline-end: 1.4rem;
    pointer-events: none
}

.collapse-plus>.collapse-title:after {
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-timing-function: cubic-bezier(0,0,.2,1);
    transition-duration: .3s;
    top: .9rem;
    content: "+"
}

.collapse:not(.collapse-open):not(.collapse-close)>.collapse-title,.collapse:not(.collapse-open):not(.collapse-close)>input[type=checkbox],.collapse:not(.collapse-open):not(.collapse-close)>input[type=radio]:not(:checked) {
    cursor: pointer
}

.collapse:focus:not(.collapse-open):not(.collapse-close):not(.collapse[open])>.collapse-title {
    cursor: unset
}

.collapse-title {
    position: relative
}

:where(.collapse>input[type=checkbox]),:where(.collapse>input[type=radio]) {
    z-index: 1
}

.collapse-title,:where(.collapse>input[type=checkbox]),:where(.collapse>input[type=radio]) {
    width: 100%;
    padding: 1rem;
    padding-inline-end:3rem;min-height: 3.75rem;
    transition: background-color .2s ease-out
}

.collapse-open>:where(.collapse-content),.collapse:focus:not(.collapse-close)>:where(.collapse-content),.collapse:not(.collapse-close)>:where(input[type=checkbox]:checked~.collapse-content),.collapse:not(.collapse-close)>:where(input[type=radio]:checked~.collapse-content),.collapse[open]>:where(.collapse-content) {
    padding-bottom: 1rem;
    transition: padding .2s ease-out,background-color .2s ease-out
}

.collapse-arrow:focus:not(.collapse-close)>.collapse-title:after,.collapse-arrow:not(.collapse-close)>input[type=checkbox]:checked~.collapse-title:after,.collapse-arrow:not(.collapse-close)>input[type=radio]:checked~.collapse-title:after,.collapse-open.collapse-arrow>.collapse-title:after,.collapse[open].collapse-arrow>.collapse-title:after {
    --tw-translate-y: -50%;
    --tw-rotate: 225deg;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.collapse-open.collapse-plus>.collapse-title:after,.collapse-plus:focus:not(.collapse-close)>.collapse-title:after,.collapse-plus:not(.collapse-close)>input[type=checkbox]:checked~.collapse-title:after,.collapse-plus:not(.collapse-close)>input[type=radio]:checked~.collapse-title:after,.collapse[open].collapse-plus>.collapse-title:after {
    content: "−"
}

.divider:not(:empty) {
    gap: 1rem
}

.drawer-toggle:checked~.drawer-side>.drawer-overlay {
    background-color: #0006
}

.drawer-toggle:focus-visible~.drawer-content label.drawer-button {
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px
}

.\!input input:focus {
    outline: 2px solid transparent!important;
    outline-offset: 2px!important
}

.input input:focus {
    outline: 2px solid transparent;
    outline-offset: 2px
}

.\!input[list]::-webkit-calendar-picker-indicator {
    line-height: 1em!important
}

.input[list]::-webkit-calendar-picker-indicator {
    line-height: 1em
}

.input-bordered {
    border-color: var(--fallback-bc,oklch(var(--bc)/.2))
}

.input:focus,.input:focus-within {
    box-shadow: none;
    border-color: var(--fallback-bc,oklch(var(--bc)/.2));
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px;
    outline-color: var(--fallback-bc,oklch(var(--bc)/.2))
}

.\!input:focus,.\!input:focus-within {
    box-shadow: none!important;
    border-color: var(--fallback-bc,oklch(var(--bc)/.2))!important;
    outline-style: solid!important;
    outline-width: 2px!important;
    outline-offset: 2px!important;
    outline-color: var(--fallback-bc,oklch(var(--bc)/.2))!important
}

.input-disabled,.input:disabled,.input[disabled] {
    cursor: not-allowed;
    --tw-border-opacity: 1;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)));
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)));
    color: var(--fallback-bc,oklch(var(--bc)/.4))
}

.\!input:disabled,.\!input[disabled] {
    cursor: not-allowed!important;
    --tw-border-opacity: 1!important;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)))!important;
    --tw-bg-opacity: 1!important;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)))!important;
    color: var(--fallback-bc,oklch(var(--bc)/.4))!important
}

.input-disabled::-moz-placeholder,.input:disabled::-moz-placeholder,.input[disabled]::-moz-placeholder {
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-placeholder-opacity)));
    --tw-placeholder-opacity: 0.2
}

.input-disabled::placeholder,.input:disabled::placeholder,.input[disabled]::placeholder {
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-placeholder-opacity)));
    --tw-placeholder-opacity: 0.2
}

.\!input:disabled::-moz-placeholder,.\!input[disabled]::-moz-placeholder {
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-placeholder-opacity)))!important;
    --tw-placeholder-opacity: 0.2!important
}

.\!input:disabled::placeholder,.\!input[disabled]::placeholder {
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-placeholder-opacity)))!important;
    --tw-placeholder-opacity: 0.2!important
}

.\!input::-webkit-date-and-time-value {
    text-align: inherit!important
}

.input::-webkit-date-and-time-value {
    text-align: inherit
}

.join>:where(:not(:first-child)) {
    margin-top: 0;
    margin-bottom: 0;
    margin-inline-start:-1px}

.join-item:focus {
    isolation: isolate
}

@supports (color: color-mix(in oklab,black,black)) {
    @media (hover:hover) {
        .link-secondary:hover {
            color:color-mix(in oklab,var(--fallback-s,oklch(var(--s)/1)) 80%,#000)
        }
    }
}

.link-secondary {
    --tw-text-opacity: 1;
    color: var(--fallback-s,oklch(var(--s)/var(--tw-text-opacity)))
}

.link:focus {
    outline: 2px solid transparent;
    outline-offset: 2px
}

.link:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px
}

.loading {
    pointer-events: none;
    display: inline-block;
    aspect-ratio: 1/1;
    width: 1.5rem;
    background-color: currentColor;
    -webkit-mask-size: 100%;
    mask-size: 100%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center
}

.loading,.loading-spinner {
    -webkit-mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' stroke='%23000'%3E%3Cstyle%3E@keyframes spinner_zKoa{to{transform:rotate(360deg)}}@keyframes spinner_YpZS{0%25{stroke-dasharray:0 150;stroke-dashoffset:0}47.5%25{stroke-dasharray:42 150;stroke-dashoffset:-16}95%25,to{stroke-dasharray:42 150;stroke-dashoffset:-59}}%3C/style%3E%3Cg style='transform-origin:center;animation:spinner_zKoa 2s linear infinite'%3E%3Ccircle cx='12' cy='12' r='9.5' fill='none' stroke-width='3' class='spinner_V8m1' style='stroke-linecap:round;animation:spinner_YpZS 1.5s ease-out infinite'/%3E%3C/g%3E%3C/svg%3E");
    mask-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' stroke='%23000'%3E%3Cstyle%3E@keyframes spinner_zKoa{to{transform:rotate(360deg)}}@keyframes spinner_YpZS{0%25{stroke-dasharray:0 150;stroke-dashoffset:0}47.5%25{stroke-dasharray:42 150;stroke-dashoffset:-16}95%25,to{stroke-dasharray:42 150;stroke-dashoffset:-59}}%3C/style%3E%3Cg style='transform-origin:center;animation:spinner_zKoa 2s linear infinite'%3E%3Ccircle cx='12' cy='12' r='9.5' fill='none' stroke-width='3' class='spinner_V8m1' style='stroke-linecap:round;animation:spinner_YpZS 1.5s ease-out infinite'/%3E%3C/g%3E%3C/svg%3E")
}

.loading-xs {
    width: 1rem
}

.loading-sm {
    width: 1.25rem
}

:where(.menu li:empty) {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));
    opacity: .1;
    margin: .5rem 1rem;
    height: 1px
}

.menu :where(li ul):before {
    position: absolute;
    bottom: .75rem;
    inset-inline-start: 0;
    top: .75rem;
    width: 1px;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));
    opacity: .1;
    content: ""
}

.menu :where(li:not(.menu-title)>:not(ul):not(details):not(.menu-title)),.menu :where(li:not(.menu-title)>details>summary:not(.menu-title)) {
    border-radius: var(--rounded-btn,.5rem);
    padding: .5rem 1rem;
    text-align: start;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-timing-function: cubic-bezier(0,0,.2,1);
    transition-duration: .2s;
    text-wrap: balance
}

:where(.menu li:not(.menu-title):not(.disabled)>:not(ul):not(details):not(.menu-title)):is(summary):not(.active):focus-visible,:where(.menu li:not(.menu-title):not(.disabled)>:not(ul):not(details):not(.menu-title)):not(summary):not(.active).focus,:where(.menu li:not(.menu-title):not(.disabled)>:not(ul):not(details):not(.menu-title)):not(summary):not(.active):focus,:where(.menu li:not(.menu-title):not(.disabled)>details>summary:not(.menu-title)):is(summary):not(.active):focus-visible,:where(.menu li:not(.menu-title):not(.disabled)>details>summary:not(.menu-title)):not(summary):not(.active).focus,:where(.menu li:not(.menu-title):not(.disabled)>details>summary:not(.menu-title)):not(summary):not(.active):focus {
    cursor: pointer;
    background-color: var(--fallback-bc,oklch(var(--bc)/.1));
    --tw-text-opacity: 1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
    outline: 2px solid transparent;
    outline-offset: 2px
}

.menu li>:not(ul):not(.menu-title):not(details).active,.menu li>:not(ul):not(.menu-title):not(details):active,.menu li>details>summary:active {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-n,oklch(var(--n)/var(--tw-bg-opacity)));
    --tw-text-opacity: 1;
    color: var(--fallback-nc,oklch(var(--nc)/var(--tw-text-opacity)))
}

.menu :where(li>details>summary)::-webkit-details-marker {
    display: none
}

.menu :where(li>.menu-dropdown-toggle):after,.menu :where(li>details>summary):after {
    justify-self: end;
    display: block;
    margin-top: -.5rem;
    height: .5rem;
    width: .5rem;
    transform: rotate(45deg);
    transition-property: transform,margin-top;
    transition-duration: .3s;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    content: "";
    transform-origin: 75% 75%;
    box-shadow: 2px 2px;
    pointer-events: none
}

.menu :where(li>.menu-dropdown-toggle.menu-dropdown-show):after,.menu :where(li>details[open]>summary):after {
    transform: rotate(225deg);
    margin-top: 0
}

.mockup-phone .display {
    overflow: hidden;
    border-radius: 40px;
    margin-top: -25px
}

.mockup-browser .mockup-browser-toolbar .\!input {
    position: relative!important;
    margin-left: auto!important;
    margin-right: auto!important;
    display: block!important;
    height: 1.75rem!important;
    width: 24rem!important;
    overflow: hidden!important;
    text-overflow: ellipsis!important;
    white-space: nowrap!important;
    --tw-bg-opacity: 1!important;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)))!important;
    padding-left: 2rem!important;
    direction: ltr!important
}

.mockup-browser .mockup-browser-toolbar .input {
    position: relative;
    margin-left: auto;
    margin-right: auto;
    display: block;
    height: 1.75rem;
    width: 24rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)));
    padding-left: 2rem;
    direction: ltr
}

.mockup-browser .mockup-browser-toolbar .\!input:before {
    content: ""!important;
    position: absolute!important;
    left: .5rem!important;
    top: 50%!important;
    aspect-ratio: 1/1!important;
    height: .75rem!important;
    --tw-translate-y: -50%!important;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))!important;
    border-radius: 9999px!important;
    border-width: 2px!important;
    border-color: currentColor!important;
    opacity: .6!important
}

.mockup-browser .mockup-browser-toolbar .input:before {
    content: "";
    position: absolute;
    left: .5rem;
    top: 50%;
    aspect-ratio: 1/1;
    height: .75rem;
    --tw-translate-y: -50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    border-radius: 9999px;
    border-width: 2px;
    border-color: currentColor;
    opacity: .6
}

.mockup-browser .mockup-browser-toolbar .\!input:after {
    content: ""!important;
    position: absolute!important;
    left: 1.25rem!important;
    top: 50%!important;
    height: .5rem!important;
    --tw-translate-y: 25%!important;
    --tw-rotate: -45deg!important;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))!important;
    border-radius: 9999px!important;
    border-width: 1px!important;
    border-color: currentColor!important;
    opacity: .6!important
}

.mockup-browser .mockup-browser-toolbar .input:after {
    content: "";
    position: absolute;
    left: 1.25rem;
    top: 50%;
    height: .5rem;
    --tw-translate-y: 25%;
    --tw-rotate: -45deg;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    border-radius: 9999px;
    border-width: 1px;
    border-color: currentColor;
    opacity: .6
}

.modal::backdrop,.modal:not(dialog:not(.modal-open)) {
    background-color: #0006;
    animation: modal-pop .2s ease-out
}

.modal-backdrop {
    z-index: -1;
    grid-column-start: 1;
    grid-row-start: 1;
    display: grid;
    align-self: stretch;
    justify-self: stretch;
    color: transparent
}

.modal-open .modal-box,.modal-toggle:checked+.modal .modal-box,.modal:target .modal-box,.modal[open] .modal-box {
    --tw-translate-y: 0px;
    --tw-scale-x: 1;
    --tw-scale-y: 1;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

@keyframes modal-pop {
    0% {
        opacity: 0
    }
}

.progress::-moz-progress-bar {
    border-radius: var(--rounded-box,1rem);
    --tw-bg-opacity: 1;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)))
}

.progress-primary::-moz-progress-bar {
    border-radius: var(--rounded-box,1rem);
    --tw-bg-opacity: 1;
    background-color: var(--fallback-p,oklch(var(--p)/var(--tw-bg-opacity)))
}

.progress:indeterminate {
    --progress-color: var(--fallback-bc,oklch(var(--bc)/1));
    background-image: repeating-linear-gradient(90deg,var(--progress-color) -1%,var(--progress-color) 10%,transparent 10%,transparent 90%);
    background-size: 200%;
    background-position-x: 15%;
    animation: progress-loading 5s ease-in-out infinite
}

.progress-primary:indeterminate {
    --progress-color: var(--fallback-p,oklch(var(--p)/1))
}

.progress::-webkit-progress-bar {
    border-radius: var(--rounded-box,1rem);
    background-color: transparent
}

.progress::-webkit-progress-value {
    border-radius: var(--rounded-box,1rem);
    --tw-bg-opacity: 1;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)))
}

.progress-primary::-webkit-progress-value {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-p,oklch(var(--p)/var(--tw-bg-opacity)))
}

.progress:indeterminate::-moz-progress-bar {
    background-color: transparent;
    background-image: repeating-linear-gradient(90deg,var(--progress-color) -1%,var(--progress-color) 10%,transparent 10%,transparent 90%);
    background-size: 200%;
    background-position-x: 15%;
    animation: progress-loading 5s ease-in-out infinite
}

@keyframes progress-loading {
    50% {
        background-position-x: -115%
    }
}

.radio:focus {
    box-shadow: none
}

.radio:focus-visible {
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px;
    outline-color: var(--fallback-bc,oklch(var(--bc)/1))
}

.radio:checked,.radio[aria-checked=true] {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-bg-opacity)));
    background-image: none;
    animation: radiomark var(--animation-input,.2s) ease-out;
    box-shadow: 0 0 0 4px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 4px var(--fallback-b1,oklch(var(--b1)/1)) inset
}

.radio:disabled {
    cursor: not-allowed;
    opacity: .2
}

@keyframes radiomark {
    0% {
        box-shadow: 0 0 0 12px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 12px var(--fallback-b1,oklch(var(--b1)/1)) inset
    }

    50% {
        box-shadow: 0 0 0 3px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 3px var(--fallback-b1,oklch(var(--b1)/1)) inset
    }

    to {
        box-shadow: 0 0 0 4px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 4px var(--fallback-b1,oklch(var(--b1)/1)) inset
    }
}

.range:focus-visible::-webkit-slider-thumb {
    --focus-shadow: 0 0 0 6px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 2rem var(--range-shdw) inset
}

.range:focus-visible::-moz-range-thumb {
    --focus-shadow: 0 0 0 6px var(--fallback-b1,oklch(var(--b1)/1)) inset,0 0 0 2rem var(--range-shdw) inset
}

.range::-webkit-slider-runnable-track {
    height: .5rem;
    width: 100%;
    border-radius: var(--rounded-box,1rem);
    background-color: var(--fallback-bc,oklch(var(--bc)/.1))
}

.range::-moz-range-track {
    height: .5rem;
    width: 100%;
    border-radius: var(--rounded-box,1rem);
    background-color: var(--fallback-bc,oklch(var(--bc)/.1))
}

.range::-webkit-slider-thumb {
    position: relative;
    height: 1.5rem;
    width: 1.5rem;
    border-radius: var(--rounded-box,1rem);
    border-style: none;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)));
    appearance: none;
    -webkit-appearance: none;
    top: 50%;
    color: var(--range-shdw);
    transform: translateY(-50%);
    --filler-size: 100rem;
    --filler-offset: 0.6rem;
    box-shadow: 0 0 0 3px var(--range-shdw) inset,var(--focus-shadow,0 0),calc(var(--filler-size)*-1 - var(--filler-offset)) 0 0 var(--filler-size)
}

.range::-moz-range-thumb {
    position: relative;
    height: 1.5rem;
    width: 1.5rem;
    border-radius: var(--rounded-box,1rem);
    border-style: none;
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)));
    top: 50%;
    color: var(--range-shdw);
    --filler-size: 100rem;
    --filler-offset: 0.5rem;
    box-shadow: 0 0 0 3px var(--range-shdw) inset,var(--focus-shadow,0 0),calc(var(--filler-size)*-1 - var(--filler-offset)) 0 0 var(--filler-size)
}

@keyframes rating-pop {
    0% {
        transform: translateY(-.125em)
    }

    40% {
        transform: translateY(-.125em)
    }

    to {
        transform: translateY(0)
    }
}

.select:focus {
    box-shadow: none;
    border-color: var(--fallback-bc,oklch(var(--bc)/.2));
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px;
    outline-color: var(--fallback-bc,oklch(var(--bc)/.2))
}

.select-disabled,.select:disabled,.select[disabled] {
    cursor: not-allowed;
    --tw-border-opacity: 1;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)));
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)));
    --tw-text-opacity: 0.2
}

.select-disabled::-moz-placeholder,.select:disabled::-moz-placeholder,.select[disabled]::-moz-placeholder {
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-placeholder-opacity)));
    --tw-placeholder-opacity: 0.2
}

.select-disabled::placeholder,.select:disabled::placeholder,.select[disabled]::placeholder {
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-placeholder-opacity)));
    --tw-placeholder-opacity: 0.2
}

.select-multiple,.select[multiple],.select[size].select:not([size="1"]) {
    background-image: none;
    padding-right: 1rem
}

[dir=rtl] .select {
    background-position: 12px calc(1px + 50%),16px calc(1px + 50%)
}

@keyframes skeleton {
    0% {
        background-position: 150%
    }

    to {
        background-position: -50%
    }
}

.tabs-lifted>.tab:focus-visible {
    border-end-end-radius: 0;
    border-end-start-radius: 0
}

.tab.tab-active:not(.tab-disabled):not([disabled]),.tab:is(input:checked) {
    border-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));
    --tw-border-opacity: 1;
    --tw-text-opacity: 1
}

.tab:focus {
    outline: 2px solid transparent;
    outline-offset: 2px
}

.tab:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -5px
}

.tab-disabled,.tab[disabled] {
    cursor: not-allowed;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
    --tw-text-opacity: 0.2
}

.tabs-bordered>.tab {
    border-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));
    --tw-border-opacity: 0.2;
    border-style: solid;
    border-bottom-width: calc(var(--tab-border, 1px) + 1px)
}

.tabs-lifted>.tab {
    border: var(--tab-border,1px) solid transparent;
    border-width: 0 0 var(--tab-border,1px) 0;
    border-start-start-radius: var(--tab-radius,.5rem);
    border-start-end-radius: var(--tab-radius,.5rem);
    border-bottom-color: var(--tab-border-color);
    padding-inline-start:var(--tab-padding,1rem);padding-inline-end: var(--tab-padding,1rem);
    padding-top: var(--tab-border,1px)
}

.tabs-lifted>.tab.tab-active:not(.tab-disabled):not([disabled]),.tabs-lifted>.tab:is(input:checked) {
    background-color: var(--tab-bg);
    border-width: var(--tab-border,1px) var(--tab-border,1px) 0 var(--tab-border,1px);
    border-inline-start-color:var(--tab-border-color);border-inline-end-color: var(--tab-border-color);
    border-top-color: var(--tab-border-color);
    padding-inline-start:calc(var(--tab-padding, 1rem) - var(--tab-border, 1px));padding-inline-end: calc(var(--tab-padding, 1rem) - var(--tab-border, 1px));
    padding-bottom: var(--tab-border,1px);
    padding-top: 0
}

.tabs-lifted>.tab.tab-active:not(.tab-disabled):not([disabled]):before,.tabs-lifted>.tab:is(input:checked):before {
    z-index: 1;
    content: "";
    display: block;
    position: absolute;
    width: calc(100% + var(--tab-radius, .5rem)*2);
    height: var(--tab-radius,.5rem);
    bottom: 0;
    background-size: var(--tab-radius,.5rem);
    background-position: 0 0,100% 0;
    background-repeat: no-repeat;
    --tab-grad: calc(69% - var(--tab-border, 1px));
    --radius-start: radial-gradient(circle at top left,transparent var(--tab-grad),var(--tab-border-color) calc(var(--tab-grad) + 0.25px),var(--tab-border-color) calc(var(--tab-grad) + var(--tab-border, 1px)),var(--tab-bg) calc(var(--tab-grad) + var(--tab-border, 1px) + 0.25px));
    --radius-end: radial-gradient(circle at top right,transparent var(--tab-grad),var(--tab-border-color) calc(var(--tab-grad) + 0.25px),var(--tab-border-color) calc(var(--tab-grad) + var(--tab-border, 1px)),var(--tab-bg) calc(var(--tab-grad) + var(--tab-border, 1px) + 0.25px));
    background-image: var(--radius-start),var(--radius-end)
}

.tabs-lifted>.tab.tab-active:not(.tab-disabled):not([disabled]):first-child:before,.tabs-lifted>.tab:is(input:checked):first-child:before {
    background-image: var(--radius-end);
    background-position: 100% 0
}

[dir=rtl] .tabs-lifted>.tab.tab-active:not(.tab-disabled):not([disabled]):first-child:before,[dir=rtl] .tabs-lifted>.tab:is(input:checked):first-child:before {
    background-image: var(--radius-start);
    background-position: 0 0
}

.tabs-lifted>.tab.tab-active:not(.tab-disabled):not([disabled]):last-child:before,.tabs-lifted>.tab:is(input:checked):last-child:before {
    background-image: var(--radius-start);
    background-position: 0 0
}

[dir=rtl] .tabs-lifted>.tab.tab-active:not(.tab-disabled):not([disabled]):last-child:before,[dir=rtl] .tabs-lifted>.tab:is(input:checked):last-child:before {
    background-image: var(--radius-end);
    background-position: 100% 0
}

.tabs-lifted>.tab-active:not(.tab-disabled):not([disabled])+.tabs-lifted .tab-active:not(.tab-disabled):not([disabled]):before,.tabs-lifted>.tab:is(input:checked)+.tabs-lifted .tab:is(input:checked):before {
    background-image: var(--radius-end);
    background-position: 100% 0
}

.tabs-boxed .tab {
    border-radius: var(--rounded-btn,.5rem)
}

.table tr.active,.table tr.active:nth-child(2n),.table-zebra tbody tr:nth-child(2n) {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)))
}

.table-zebra tr.active,.table-zebra tr.active:nth-child(2n),.table-zebra-zebra tbody tr:nth-child(2n) {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b3,oklch(var(--b3)/var(--tw-bg-opacity)))
}

.textarea:focus {
    box-shadow: none;
    border-color: var(--fallback-bc,oklch(var(--bc)/.2));
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px;
    outline-color: var(--fallback-bc,oklch(var(--bc)/.2))
}

.textarea-disabled,.textarea:disabled,.textarea[disabled] {
    cursor: not-allowed;
    --tw-border-opacity: 1;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)));
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)));
    --tw-text-opacity: 0.2
}

.textarea-disabled::-moz-placeholder,.textarea:disabled::-moz-placeholder,.textarea[disabled]::-moz-placeholder {
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-placeholder-opacity)));
    --tw-placeholder-opacity: 0.2
}

.textarea-disabled::placeholder,.textarea:disabled::placeholder,.textarea[disabled]::placeholder {
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-placeholder-opacity)));
    --tw-placeholder-opacity: 0.2
}

@keyframes toast-pop {
    0% {
        transform: scale(.9);
        opacity: 0
    }

    to {
        transform: scale(1);
        opacity: 1
    }
}

[dir=rtl] .toggle {
    --handleoffsetcalculator: calc(var(--handleoffset)*1)
}

.toggle:focus-visible {
    outline-style: solid;
    outline-width: 2px;
    outline-offset: 2px;
    outline-color: var(--fallback-bc,oklch(var(--bc)/.2))
}

.toggle:hover {
    background-color: currentColor
}

.toggle:checked,.toggle[aria-checked=true],.toggle[checked=true] {
    background-image: none;
    --handleoffsetcalculator: var(--handleoffset);
    --tw-text-opacity: 1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)))
}

[dir=rtl] .toggle:checked,[dir=rtl] .toggle[aria-checked=true],[dir=rtl] .toggle[checked=true] {
    --handleoffsetcalculator: calc(var(--handleoffset)*-1)
}

.toggle:indeterminate {
    --tw-text-opacity: 1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)));
    box-shadow: calc(var(--handleoffset)/2) 0 0 2px var(--tglbg) inset,calc(var(--handleoffset)/-2) 0 0 2px var(--tglbg) inset,0 0 0 2px var(--tglbg) inset
}

[dir=rtl] .toggle:indeterminate {
    box-shadow: calc(var(--handleoffset)/2) 0 0 2px var(--tglbg) inset,calc(var(--handleoffset)/-2) 0 0 2px var(--tglbg) inset,0 0 0 2px var(--tglbg) inset
}

.toggle:disabled {
    cursor: not-allowed;
    --tw-border-opacity: 1;
    border-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-border-opacity)));
    background-color: transparent;
    opacity: .3;
    --togglehandleborder: 0 0 0 3px var(--fallback-bc,oklch(var(--bc)/1)) inset,var(--handleoffsetcalculator) 0 0 3px var(--fallback-bc,oklch(var(--bc)/1)) inset
}

.no-animation {
    --btn-focus-scale: 1;
    --animation-btn: 0;
    --animation-input: 0
}

.tab-border {
    --tab-border: 1px
}

.artboard.\!phone {
    width: 320px!important
}

.artboard.phone {
    width: 320px
}

.badge-sm {
    height: 1rem;
    font-size: .75rem;
    line-height: 1rem;
    padding-left: .438rem;
    padding-right: .438rem
}

.btm-nav-xs>:where(.active) {
    border-top-width: 1px
}

.btm-nav-sm>:where(.active) {
    border-top-width: 2px
}

.btm-nav-md>:where(.active) {
    border-top-width: 2px
}

.btm-nav-lg>:where(.active) {
    border-top-width: 4px
}

.btn-xs {
    height: 1.5rem;
    min-height: 1.5rem;
    padding-left: .5rem;
    padding-right: .5rem;
    font-size: .75rem
}

.btn-sm {
    height: 2rem;
    min-height: 2rem;
    padding-left: .75rem;
    padding-right: .75rem;
    font-size: .875rem
}

.btn-md {
    height: 3rem;
    min-height: 3rem;
    padding-left: 1rem;
    padding-right: 1rem;
    font-size: .875rem
}

.btn-lg {
    height: 4rem;
    min-height: 4rem;
    padding-left: 1.5rem;
    padding-right: 1.5rem;
    font-size: 1.125rem
}

.btn-square:where(.btn-xs) {
    height: 1.5rem;
    width: 1.5rem;
    padding: 0
}

.btn-square:where(.btn-sm) {
    height: 2rem;
    width: 2rem;
    padding: 0
}

.btn-square:where(.btn-md) {
    height: 3rem;
    width: 3rem;
    padding: 0
}

.btn-square:where(.btn-lg) {
    height: 4rem;
    width: 4rem;
    padding: 0
}

.btn-circle:where(.btn-xs) {
    height: 1.5rem;
    width: 1.5rem;
    border-radius: 9999px;
    padding: 0
}

.btn-circle:where(.btn-sm) {
    height: 2rem;
    width: 2rem;
    border-radius: 9999px;
    padding: 0
}

.btn-circle:where(.btn-md) {
    height: 3rem;
    width: 3rem;
    border-radius: 9999px;
    padding: 0
}

.btn-circle:where(.btn-lg) {
    height: 4rem;
    width: 4rem;
    border-radius: 9999px;
    padding: 0
}

.drawer-open>.drawer-toggle {
    display: none
}

.drawer-open>.drawer-toggle~.drawer-side {
    pointer-events: auto;
    visibility: visible;
    position: sticky;
    display: block;
    width: auto;
    overscroll-behavior: auto
}

.drawer-open>.drawer-toggle~.drawer-side>:not(.drawer-overlay),[dir=rtl] .drawer-open>.drawer-toggle~.drawer-side>:not(.drawer-overlay) {
    transform: translateX(0)
}

.drawer-open>.drawer-toggle:checked~.drawer-side {
    pointer-events: auto;
    visibility: visible
}

.indicator :where(.indicator-item) {
    bottom: auto;
    inset-inline-end: 0;
    inset-inline-start: auto;
    top: 0;
    --tw-translate-y: -50%;
    --tw-translate-x: 50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

:is([dir=rtl] .indicator :where(.indicator-item)) {
    --tw-translate-x: -50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.indicator :where(.indicator-item.indicator-start) {
    inset-inline-end: auto;
    inset-inline-start: 0;
    --tw-translate-x: -50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

:is([dir=rtl] .indicator :where(.indicator-item.indicator-start)) {
    --tw-translate-x: 50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.indicator :where(.indicator-item.indicator-center) {
    inset-inline-end: 50%;
    inset-inline-start: 50%;
    --tw-translate-x: -50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

:is([dir=rtl] .indicator :where(.indicator-item.indicator-center)) {
    --tw-translate-x: 50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.indicator :where(.indicator-item.indicator-end) {
    inset-inline-end: 0;
    inset-inline-start: auto;
    --tw-translate-x: 50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

:is([dir=rtl] .indicator :where(.indicator-item.indicator-end)) {
    --tw-translate-x: -50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.indicator :where(.indicator-item.indicator-bottom) {
    bottom: 0;
    top: auto;
    --tw-translate-y: 50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.indicator :where(.indicator-item.indicator-middle) {
    bottom: 50%;
    top: 50%;
    --tw-translate-y: -50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.indicator :where(.indicator-item.indicator-top) {
    bottom: auto;
    top: 0;
    --tw-translate-y: -50%;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.join.join-vertical {
    flex-direction: column
}

.join.join-vertical .join-item:first-child:not(:last-child),.join.join-vertical :first-child:not(:last-child) .join-item {
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    border-start-start-radius: inherit;
    border-start-end-radius: inherit
}

.join.join-vertical .join-item:last-child:not(:first-child),.join.join-vertical :last-child:not(:first-child) .join-item {
    border-start-start-radius: 0;
    border-start-end-radius: 0;
    border-end-start-radius: inherit;
    border-end-end-radius: inherit
}

.join.join-horizontal {
    flex-direction: row
}

.join.join-horizontal .join-item:first-child:not(:last-child),.join.join-horizontal :first-child:not(:last-child) .join-item {
    border-end-end-radius: 0;
    border-start-end-radius: 0;
    border-end-start-radius: inherit;
    border-start-start-radius: inherit
}

.join.join-horizontal .join-item:last-child:not(:first-child),.join.join-horizontal :last-child:not(:first-child) .join-item {
    border-end-start-radius: 0;
    border-start-start-radius: 0;
    border-end-end-radius: inherit;
    border-start-end-radius: inherit
}

.tabs-md :where(.tab) {
    height: 2rem;
    font-size: .875rem;
    line-height: 1.25rem;
    line-height: 2;
    --tab-padding: 1rem
}

.tabs-lg :where(.tab) {
    height: 3rem;
    font-size: 1.125rem;
    line-height: 1.75rem;
    line-height: 2;
    --tab-padding: 1.25rem
}

.tabs-sm :where(.tab) {
    height: 1.5rem;
    font-size: .875rem;
    line-height: .75rem;
    --tab-padding: 0.75rem
}

.tabs-xs :where(.tab) {
    height: 1.25rem;
    font-size: .75rem;
    line-height: .75rem;
    --tab-padding: 0.5rem
}

.avatar.online:before {
    background-color: var(--fallback-su,oklch(var(--su)/var(--tw-bg-opacity)))
}

.avatar.offline:before,.avatar.online:before {
    content: "";
    position: absolute;
    z-index: 10;
    display: block;
    border-radius: 9999px;
    --tw-bg-opacity: 1;
    outline-style: solid;
    outline-width: 2px;
    outline-color: var(--fallback-b1,oklch(var(--b1)/1));
    width: 15%;
    height: 15%;
    top: 7%;
    right: 7%
}

.avatar.offline:before {
    background-color: var(--fallback-b3,oklch(var(--b3)/var(--tw-bg-opacity)))
}

.card-compact .card-body {
    padding: 1rem;
    font-size: .875rem;
    line-height: 1.25rem
}

.card-compact .card-title {
    margin-bottom: .25rem
}

.card-normal .card-title {
    margin-bottom: .75rem
}

.drawer-open>.drawer-toggle~.drawer-side>.drawer-overlay {
    cursor: default;
    background-color: transparent
}

.join.join-vertical>:where(:not(:first-child)) {
    margin-left: 0;
    margin-right: 0;
    margin-top: -1px
}

.join.join-horizontal>:where(:not(:first-child)) {
    margin-top: 0;
    margin-bottom: 0;
    margin-inline-start:-1px}

.modal-top :where(.modal-box) {
    width: 100%;
    max-width: none;
    --tw-translate-y: -2.5rem;
    --tw-scale-x: 1;
    --tw-scale-y: 1;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    border-bottom-right-radius: var(--rounded-box,1rem);
    border-bottom-left-radius: var(--rounded-box,1rem);
    border-top-left-radius: 0;
    border-top-right-radius: 0
}

.modal-middle :where(.modal-box) {
    width: 91.666667%;
    max-width: 32rem;
    --tw-translate-y: 0px;
    --tw-scale-x: .9;
    --tw-scale-y: .9;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    border-top-left-radius: var(--rounded-box,1rem);
    border-top-right-radius: var(--rounded-box,1rem);
    border-bottom-right-radius: var(--rounded-box,1rem);
    border-bottom-left-radius: var(--rounded-box,1rem)
}

.modal-bottom :where(.modal-box) {
    width: 100%;
    max-width: none;
    --tw-translate-y: 2.5rem;
    --tw-scale-x: 1;
    --tw-scale-y: 1;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    border-top-left-radius: var(--rounded-box,1rem);
    border-top-right-radius: var(--rounded-box,1rem);
    border-bottom-right-radius: 0;
    border-bottom-left-radius: 0
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border-width: 0
}

.collapse {
    visibility: collapse
}

.static {
    position: static
}

.fixed {
    position: fixed
}

.absolute {
    position: absolute
}

.relative {
    position: relative
}

.bottom-0 {
    bottom: 0
}

.bottom-6 {
    bottom: 1.5rem
}

.bottom-\[15\%\] {
    bottom: 15%
}

.left-0 {
    left: 0
}

.left-2 {
    left: .5rem
}

.right-0 {
    right: 0
}

.right-1 {
    right: .25rem
}

.right-2 {
    right: .5rem
}

.right-4 {
    right: 1rem
}

.right-6 {
    right: 1.5rem
}

.top-0 {
    top: 0
}

.top-1\/2 {
    top: 50%
}

.top-2 {
    top: .5rem
}

.top-4 {
    top: 1rem
}

.top-\[70px\] {
    top: 70px
}

.z-10 {
    z-index: 10
}

.z-40 {
    z-index: 40
}

.z-50 {
    z-index: 50
}

.col-span-1 {
    grid-column: span 1/span 1
}

.col-span-3 {
    grid-column: span 3/span 3
}

.col-span-full {
    grid-column: 1/-1
}

.col-start-1 {
    grid-column-start: 1
}

.col-start-3 {
    grid-column-start: 3
}

.col-end-2 {
    grid-column-end: 2
}

.col-end-4 {
    grid-column-end: 4
}

.row-span-1 {
    grid-row: span 1/span 1
}

.row-span-full {
    grid-row: 1/-1
}

.row-start-1 {
    grid-row-start: 1
}

.row-start-2 {
    grid-row-start: 2
}

.row-start-4 {
    grid-row-start: 4
}

.float-right {
    float: right
}

.m-2 {
    margin: .5rem
}

.mx-10 {
    margin-left: 2.5rem;
    margin-right: 2.5rem
}

.mx-4 {
    margin-left: 1rem;
    margin-right: 1rem
}

.mx-5 {
    margin-left: 1.25rem;
    margin-right: 1.25rem
}

.mx-6 {
    margin-left: 1.5rem;
    margin-right: 1.5rem
}

.mx-auto {
    margin-left: auto;
    margin-right: auto
}

.my-1 {
    margin-top: .25rem;
    margin-bottom: .25rem
}

.my-2 {
    margin-top: .5rem;
    margin-bottom: .5rem
}

.my-20 {
    margin-top: 5rem;
    margin-bottom: 5rem
}

.my-8 {
    margin-top: 2rem;
    margin-bottom: 2rem
}

.-mt-12 {
    margin-top: -3rem
}

.mb-10 {
    margin-bottom: 2.5rem
}

.mb-2 {
    margin-bottom: .5rem
}

.mb-5 {
    margin-bottom: 1.25rem
}

.ml-1 {
    margin-left: .25rem
}

.ml-2 {
    margin-left: .5rem
}

.mr-2 {
    margin-right: .5rem
}

.mr-3 {
    margin-right: .75rem
}

.mt-10 {
    margin-top: 2.5rem
}

.mt-2 {
    margin-top: .5rem
}

.mt-4 {
    margin-top: 1rem
}

.mt-5 {
    margin-top: 1.25rem
}

.mt-6 {
    margin-top: 1.5rem
}

.mt-8 {
    margin-top: 2rem
}

.mt-\[5px\] {
    margin-top: 5px
}

.mt-auto {
    margin-top: auto
}

.box-border {
    box-sizing: border-box
}

.block {
    display: block
}

.inline-block {
    display: inline-block
}

.inline {
    display: inline
}

.flex {
    display: flex
}

.inline-flex {
    display: inline-flex
}

.grid {
    display: grid
}

.contents {
    display: contents
}

.hidden {
    display: none
}

.aspect-\[156\/87\] {
    aspect-ratio: 156/87
}

.h-12 {
    height: 3rem
}

.h-16 {
    height: 4rem
}

.h-3 {
    height: .75rem
}

.h-32 {
    height: 8rem
}

.h-44 {
    height: 11rem
}

.h-6 {
    height: 1.5rem
}

.h-8 {
    height: 2rem
}

.h-\[174px\] {
    height: 174px
}

.h-\[210px\] {
    height: 210px
}

.h-\[52px\] {
    height: 52px
}

.h-full {
    height: 100%
}

.h-min {
    height: -moz-min-content;
    height: min-content
}

.h-px {
    height: 1px
}

.max-h-\[215px\] {
    max-height: 215px
}

.max-h-\[250px\] {
    max-height: 250px
}

.max-h-\[300px\] {
    max-height: 300px
}

.max-h-\[55px\] {
    max-height: 55px
}

.max-h-\[80px\] {
    max-height: 80px
}

.max-h-full {
    max-height: 100%
}

.min-h-\[100px\] {
    min-height: 100px
}

.min-h-\[157px\] {
    min-height: 157px
}

.min-h-\[40px\] {
    min-height: 40px
}

.min-h-\[42px\] {
    min-height: 42px
}

.min-h-\[660px\] {
    min-height: 660px
}

.min-h-screen {
    min-height: 100vh
}

.w-10 {
    width: 2.5rem
}

.w-11\/12 {
    width: 91.666667%
}

.w-12 {
    width: 3rem
}

.w-16 {
    width: 4rem
}

.w-3 {
    width: .75rem
}

.w-44 {
    width: 11rem
}

.w-48 {
    width: 12rem
}

.w-6 {
    width: 1.5rem
}

.w-8 {
    width: 2rem
}

.w-\[287px\] {
    width: 287px
}

.w-\[316px\] {
    width: 316px
}

.w-\[330px\] {
    width: 330px
}

.w-\[332px\] {
    width: 332px
}

.w-\[363px\] {
    width: 363px
}

.w-\[400px\] {
    width: 400px
}

.w-\[4px\] {
    width: 4px
}

.w-\[522px\] {
    width: 522px
}

.w-auto {
    width: auto
}

.w-fit {
    width: -moz-fit-content;
    width: fit-content
}

.w-full {
    width: 100%
}

.w-min {
    width: -moz-min-content;
    width: min-content
}

.w-screen {
    width: 100vw
}

.min-w-\[100px\] {
    min-width: 100px
}

.min-w-\[150px\] {
    min-width: 150px
}

.min-w-\[157px\] {
    min-width: 157px
}

.min-w-\[160px\] {
    min-width: 160px
}

.min-w-\[180px\] {
    min-width: 180px
}

.min-w-\[200px\] {
    min-width: 200px
}

.min-w-\[400px\] {
    min-width: 400px
}

.min-w-\[40px\] {
    min-width: 40px
}

.min-w-\[42px\] {
    min-width: 42px
}

.min-w-\[4px\] {
    min-width: 4px
}

.max-w-6xl {
    max-width: 72rem
}

.max-w-7xl {
    max-width: 80rem
}

.max-w-\[139px\] {
    max-width: 139px
}

.max-w-\[200px\] {
    max-width: 200px
}

.max-w-\[2px\] {
    max-width: 2px
}

.max-w-\[300px\] {
    max-width: 300px
}

.max-w-\[310px\] {
    max-width: 310px
}

.max-w-\[350px\] {
    max-width: 350px
}

.max-w-\[360px\] {
    max-width: 360px
}

.max-w-\[380px\] {
    max-width: 380px
}

.max-w-\[392px\] {
    max-width: 392px
}

.max-w-\[400px\] {
    max-width: 400px
}

.max-w-\[420px\] {
    max-width: 420px
}

.max-w-\[480px\] {
    max-width: 480px
}

.max-w-\[522px\] {
    max-width: 522px
}

.max-w-\[640px\] {
    max-width: 640px
}

.max-w-\[80px\] {
    max-width: 80px
}

.max-w-full {
    max-width: 100%
}

.max-w-sm {
    max-width: 24rem
}

.flex-1 {
    flex: 1 1 0%
}

.flex-auto {
    flex: 1 1 auto
}

.flex-shrink {
    flex-shrink: 1
}

.shrink-0 {
    flex-shrink: 0
}

.flex-grow,.grow {
    flex-grow: 1
}

.-translate-x-3 {
    --tw-translate-x: -0.75rem
}

.-translate-x-3,.-translate-y-2 {
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.-translate-y-2 {
    --tw-translate-y: -0.5rem
}

.translate-x-12 {
    --tw-translate-x: 3rem
}

.translate-x-12,.translate-y-\[200\%\] {
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.translate-y-\[200\%\] {
    --tw-translate-y: 200%
}

.rotate-12 {
    --tw-rotate: 12deg
}

.rotate-12,.rotate-180 {
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.rotate-180 {
    --tw-rotate: 180deg
}

.transform {
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.transform-gpu {
    transform: translate3d(var(--tw-translate-x),var(--tw-translate-y),0) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.cursor-pointer {
    cursor: pointer
}

.list-inside {
    list-style-position: inside
}

.list-disc {
    list-style-type: disc
}

.auto-cols-max {
    grid-auto-columns: max-content
}

.grid-flow-row {
    grid-auto-flow: row
}

.grid-flow-col {
    grid-auto-flow: column
}

.grid-cols-1 {
    grid-template-columns: repeat(1,minmax(0,1fr))
}

.grid-cols-2 {
    grid-template-columns: repeat(2,minmax(0,1fr))
}

.grid-cols-3 {
    grid-template-columns: repeat(3,minmax(0,1fr))
}

.grid-cols-6 {
    grid-template-columns: repeat(6,minmax(0,1fr))
}

.grid-cols-\[32px_1fr_32px\] {
    grid-template-columns: 32px 1fr 32px
}

.grid-cols-\[48px_1fr_48px\] {
    grid-template-columns: 48px 1fr 48px
}

.grid-rows-1 {
    grid-template-rows: repeat(1,minmax(0,1fr))
}

.grid-rows-\[1fr_32px_1fr_64px\] {
    grid-template-rows: 1fr 32px 1fr 64px
}

.grid-rows-\[auto_1fr\] {
    grid-template-rows: auto 1fr
}

.flex-row {
    flex-direction: row
}

.flex-col {
    flex-direction: column
}

.flex-wrap {
    flex-wrap: wrap
}

.flex-nowrap {
    flex-wrap: nowrap
}

.place-items-center {
    place-items: center
}

.items-start {
    align-items: flex-start
}

.items-end {
    align-items: flex-end
}

.items-center {
    align-items: center
}

.justify-start {
    justify-content: flex-start
}

.justify-end {
    justify-content: flex-end
}

.justify-center {
    justify-content: center
}

.justify-between {
    justify-content: space-between
}

.gap-1 {
    gap: .25rem
}

.gap-10 {
    gap: 2.5rem
}

.gap-12 {
    gap: 3rem
}

.gap-2 {
    gap: .5rem
}

.gap-3 {
    gap: .75rem
}

.gap-4 {
    gap: 1rem
}

.gap-5 {
    gap: 1.25rem
}

.gap-6 {
    gap: 1.5rem
}

.gap-8 {
    gap: 2rem
}

.gap-9 {
    gap: 2.25rem
}

.gap-\[16px\] {
    gap: 16px
}

.gap-\[2px\] {
    gap: 2px
}

.gap-\[3px\] {
    gap: 3px
}

.gap-\[4px\] {
    gap: 4px
}

.gap-\[6px\] {
    gap: 6px
}

.space-y-4>:not([hidden])~:not([hidden]) {
    --tw-space-y-reverse: 0;
    margin-top: calc(1rem*(1 - var(--tw-space-y-reverse)));
    margin-bottom: calc(1rem*var(--tw-space-y-reverse))
}

.divide-y>:not([hidden])~:not([hidden]) {
    --tw-divide-y-reverse: 0;
    border-top-width: calc(1px*(1 - var(--tw-divide-y-reverse)));
    border-bottom-width: calc(1px*var(--tw-divide-y-reverse))
}

.divide-base-200>:not([hidden])~:not([hidden]) {
    --tw-divide-opacity: 1;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-divide-opacity)))
}

.place-self-start {
    place-self: start
}

.place-self-end {
    place-self: end
}

.self-center {
    align-self: center
}

.overflow-auto {
    overflow: auto
}

.overflow-hidden {
    overflow: hidden
}

.overflow-x-auto {
    overflow-x: auto
}

.overflow-y-auto {
    overflow-y: auto
}

.overflow-x-hidden {
    overflow-x: hidden
}

.overflow-y-hidden {
    overflow-y: hidden
}

.overflow-y-scroll {
    overflow-y: scroll
}

.truncate {
    overflow: hidden;
    white-space: nowrap
}

.overflow-ellipsis,.truncate {
    text-overflow: ellipsis
}

.whitespace-nowrap {
    white-space: nowrap
}

.break-words {
    overflow-wrap: break-word
}

.rounded {
    border-radius: .25rem
}

.rounded-\[16px\] {
    border-radius: 16px
}

.rounded-\[3px\] {
    border-radius: 3px
}

.rounded-\[6px\] {
    border-radius: 6px
}

.rounded-badge {
    border-radius: var(--rounded-badge,1.9rem)
}

.rounded-box {
    border-radius: var(--rounded-box,1rem)
}

.rounded-btn {
    border-radius: var(--rounded-btn,.5rem)
}

.rounded-full {
    border-radius: 9999px
}

.rounded-lg {
    border-radius: .5rem
}

.rounded-md {
    border-radius: .375rem
}

.rounded-sm {
    border-radius: .125rem
}

.rounded-l {
    border-top-left-radius: .25rem;
    border-bottom-left-radius: .25rem
}

.rounded-l-full {
    border-top-left-radius: 9999px;
    border-bottom-left-radius: 9999px
}

.rounded-l-lg {
    border-top-left-radius: .5rem;
    border-bottom-left-radius: .5rem
}

.rounded-r-lg {
    border-top-right-radius: .5rem;
    border-bottom-right-radius: .5rem
}

.rounded-r-md {
    border-bottom-right-radius: .375rem
}

.rounded-r-md,.rounded-t-md {
    border-top-right-radius: .375rem
}

.rounded-t-md {
    border-top-left-radius: .375rem
}

.rounded-bl-none {
    border-bottom-left-radius: 0
}

.border {
    border-width: 1px
}

.border-0 {
    border-width: 0
}

.border-2 {
    border-width: 2px
}

.border-b {
    border-bottom-width: 1px
}

.border-b-2 {
    border-bottom-width: 2px
}

.border-t {
    border-top-width: 1px
}

.border-t-2 {
    border-top-width: 2px
}

.border-t-\[1px\] {
    border-top-width: 1px
}

.border-none {
    border-style: none
}

.border-\[\#C9CFCF\] {
    --tw-border-opacity: 1;
    border-color: rgb(201 207 207/var(--tw-border-opacity))
}

.border-base-100 {
    --tw-border-opacity: 1;
    border-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-border-opacity)))
}

.border-base-200 {
    --tw-border-opacity: 1;
    border-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-border-opacity)))
}

.border-base-300 {
    --tw-border-opacity: 1;
    border-color: var(--fallback-b3,oklch(var(--b3)/var(--tw-border-opacity)))
}

.border-gray-300 {
    --tw-border-opacity: 1;
    border-color: rgb(209 213 219/var(--tw-border-opacity))
}

.border-transparent {
    border-color: transparent
}

.bg-\[\#45D268\] {
    --tw-bg-opacity: 1;
    background-color: rgb(69 210 104/var(--tw-bg-opacity))
}

.bg-\[var\(--bg-color\)\] {
    background-color: var(--bg-color)
}

.bg-accent {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-a,oklch(var(--a)/var(--tw-bg-opacity)))
}

.bg-base-100 {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))
}

.bg-base-200 {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)))
}

.bg-black {
    --tw-bg-opacity: 1;
    background-color: rgb(0 0 0/var(--tw-bg-opacity))
}

.bg-error {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-er,oklch(var(--er)/var(--tw-bg-opacity)))
}

.bg-neutral-content {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-nc,oklch(var(--nc)/var(--tw-bg-opacity)))
}

.bg-primary {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-p,oklch(var(--p)/var(--tw-bg-opacity)))
}

.bg-secondary {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-s,oklch(var(--s)/var(--tw-bg-opacity)))
}

.bg-slate-100 {
    --tw-bg-opacity: 1;
    background-color: rgb(241 245 249/var(--tw-bg-opacity))
}

.bg-slate-300 {
    --tw-bg-opacity: 1;
    background-color: rgb(203 213 225/var(--tw-bg-opacity))
}

.bg-slate-800 {
    --tw-bg-opacity: 1;
    background-color: rgb(30 41 59/var(--tw-bg-opacity))
}

.bg-white {
    --tw-bg-opacity: 1;
    background-color: rgb(255 255 255/var(--tw-bg-opacity))
}

.bg-opacity-15 {
    --tw-bg-opacity: 0.15
}

.bg-cover {
    background-size: cover
}

.bg-center {
    background-position: 50%
}

.object-contain {
    -o-object-fit: contain;
    object-fit: contain
}

.object-cover {
    -o-object-fit: cover;
    object-fit: cover
}

.object-fill {
    -o-object-fit: fill;
    object-fit: fill
}

.object-scale-down {
    -o-object-fit: scale-down;
    object-fit: scale-down
}

.p-1 {
    padding: .25rem
}

.p-10 {
    padding: 2.5rem
}

.p-14 {
    padding: 3.5rem
}

.p-2 {
    padding: .5rem
}

.p-3 {
    padding: .75rem
}

.p-4 {
    padding: 1rem
}

.p-5 {
    padding: 1.25rem
}

.p-6 {
    padding: 1.5rem
}

.px-0 {
    padding-left: 0;
    padding-right: 0
}

.px-2 {
    padding-left: .5rem;
    padding-right: .5rem
}

.px-4 {
    padding-left: 1rem;
    padding-right: 1rem
}

.px-5 {
    padding-left: 1.25rem;
    padding-right: 1.25rem
}

.px-6 {
    padding-left: 1.5rem;
    padding-right: 1.5rem
}

.px-60 {
    padding-left: 15rem;
    padding-right: 15rem
}

.px-8 {
    padding-left: 2rem;
    padding-right: 2rem
}

.px-\[12px\] {
    padding-left: 12px;
    padding-right: 12px
}

.py-0 {
    padding-top: 0;
    padding-bottom: 0
}

.py-1 {
    padding-top: .25rem;
    padding-bottom: .25rem
}

.py-10 {
    padding-top: 2.5rem;
    padding-bottom: 2.5rem
}

.py-16 {
    padding-top: 4rem;
    padding-bottom: 4rem
}

.py-2 {
    padding-top: .5rem;
    padding-bottom: .5rem
}

.py-20 {
    padding-top: 5rem;
    padding-bottom: 5rem
}

.py-28 {
    padding-top: 7rem;
    padding-bottom: 7rem
}

.py-3 {
    padding-top: .75rem;
    padding-bottom: .75rem
}

.py-4 {
    padding-top: 1rem;
    padding-bottom: 1rem
}

.py-5 {
    padding-top: 1.25rem;
    padding-bottom: 1.25rem
}

.py-6 {
    padding-top: 1.5rem;
    padding-bottom: 1.5rem
}

.pb-1 {
    padding-bottom: .25rem
}

.pb-12 {
    padding-bottom: 3rem
}

.pb-2 {
    padding-bottom: .5rem
}

.pb-4 {
    padding-bottom: 1rem
}

.pb-\[15px\] {
    padding-bottom: 15px
}

.pl-0 {
    padding-left: 0
}

.pl-1 {
    padding-left: .25rem
}

.pl-3 {
    padding-left: .75rem
}

.pr-2 {
    padding-right: .5rem
}

.pr-4 {
    padding-right: 1rem
}

.pr-5 {
    padding-right: 1.25rem
}

.pt-1 {
    padding-top: .25rem
}

.pt-2 {
    padding-top: .5rem
}

.pt-20 {
    padding-top: 5rem
}

.pt-36 {
    padding-top: 9rem
}

.pt-4 {
    padding-top: 1rem
}

.pt-5 {
    padding-top: 1.25rem
}

.pt-6 {
    padding-top: 1.5rem
}

.text-left {
    text-align: left
}

.text-center {
    text-align: center
}

.text-right {
    text-align: right
}

.text-start {
    text-align: start
}

.text-end {
    text-align: end
}

.\!text-sm {
    font-size: .875rem!important;
    line-height: 1.25rem!important
}

.text-2xl {
    font-size: 1.5rem;
    line-height: 2rem
}

.text-3xl {
    font-size: 1.875rem;
    line-height: 2.25rem
}

.text-5xl {
    font-size: 3rem;
    line-height: 1
}

.text-6xl {
    font-size: 3.75rem;
    line-height: 1
}

.text-7xl {
    font-size: 4.5rem;
    line-height: 1
}

.text-9xl {
    font-size: 8rem;
    line-height: 1
}

.text-\[12px\] {
    font-size: 12px
}

.text-\[13px\] {
    font-size: 13px
}

.text-\[15px\] {
    font-size: 15px
}

.text-\[16px\] {
    font-size: 16px
}

.text-\[18px\] {
    font-size: 18px
}

.text-\[40px\] {
    font-size: 40px
}

.text-\[80px\] {
    font-size: 80px
}

.text-base {
    font-size: 1rem;
    line-height: 1.5rem
}

.text-lg {
    font-size: 1.125rem;
    line-height: 1.75rem
}

.text-sm {
    font-size: .875rem;
    line-height: 1.25rem
}

.text-sm\/4 {
    font-size: .875rem;
    line-height: 1rem
}

.text-xl {
    font-size: 1.25rem;
    line-height: 1.75rem
}

.text-xs {
    font-size: .75rem;
    line-height: 1rem
}

.\!font-medium {
    font-weight: 500!important
}

.font-bold {
    font-weight: 700
}

.font-medium {
    font-weight: 500
}

.font-normal {
    font-weight: 400
}

.font-semibold {
    font-weight: 600
}

.font-thin {
    font-weight: 100
}

.uppercase {
    text-transform: uppercase
}

.capitalize {
    text-transform: capitalize
}

.leading-4 {
    line-height: 1rem
}

.leading-5 {
    line-height: 1.25rem
}

.leading-\[1\.125rem\] {
    line-height: 1.125rem
}

.leading-\[100\%\] {
    line-height: 100%
}

.leading-\[10px\] {
    line-height: 10px
}

.leading-\[120\%\] {
    line-height: 120%
}

.leading-\[150\%\] {
    line-height: 150%
}

.leading-\[15px\] {
    line-height: 15px
}

.leading-\[18px\] {
    line-height: 18px
}

.leading-\[19px\] {
    line-height: 19px
}

.leading-\[20px\] {
    line-height: 20px
}

.leading-\[22px\] {
    line-height: 22px
}

.tracking-\[-2\.4px\] {
    letter-spacing: -2.4px
}

.tracking-\[-3px\] {
    letter-spacing: -3px
}

.text-\[\#057EB5\] {
    --tw-text-opacity: 1;
    color: rgb(5 126 181/var(--tw-text-opacity))
}

.text-\[\#1e1e1e99\] {
    color: #1e1e1e99
}

.text-\[\#616B6B\] {
    --tw-text-opacity: 1;
    color: rgb(97 107 107/var(--tw-text-opacity))
}

.text-\[\#667781\] {
    --tw-text-opacity: 1;
    color: rgb(102 119 129/var(--tw-text-opacity))
}

.text-accent {
    --tw-text-opacity: 1;
    color: var(--fallback-a,oklch(var(--a)/var(--tw-text-opacity)))
}

.text-base-100 {
    --tw-text-opacity: 1;
    color: var(--fallback-b1,oklch(var(--b1)/var(--tw-text-opacity)))
}

.text-base-300 {
    --tw-text-opacity: 1;
    color: var(--fallback-b3,oklch(var(--b3)/var(--tw-text-opacity)))
}

.text-base-content {
    --tw-text-opacity: 1;
    color: var(--fallback-bc,oklch(var(--bc)/var(--tw-text-opacity)))
}

.text-black {
    --tw-text-opacity: 1;
    color: rgb(0 0 0/var(--tw-text-opacity))
}

.text-error {
    --tw-text-opacity: 1;
    color: var(--fallback-er,oklch(var(--er)/var(--tw-text-opacity)))
}

.text-gray-400 {
    --tw-text-opacity: 1;
    color: rgb(156 163 175/var(--tw-text-opacity))
}

.text-primary {
    --tw-text-opacity: 1;
    color: var(--fallback-p,oklch(var(--p)/var(--tw-text-opacity)))
}

.text-secondary {
    --tw-text-opacity: 1;
    color: var(--fallback-s,oklch(var(--s)/var(--tw-text-opacity)))
}

.text-secondary-content {
    --tw-text-opacity: 1;
    color: var(--fallback-sc,oklch(var(--sc)/var(--tw-text-opacity)))
}

.text-success {
    --tw-text-opacity: 1;
    color: var(--fallback-su,oklch(var(--su)/var(--tw-text-opacity)))
}

.text-white {
    --tw-text-opacity: 1;
    color: rgb(255 255 255/var(--tw-text-opacity))
}

.text-zinc-400 {
    --tw-text-opacity: 1;
    color: rgb(161 161 170/var(--tw-text-opacity))
}

.underline {
    text-decoration-line: underline
}

.line-through {
    text-decoration-line: line-through
}

.opacity-0 {
    opacity: 0
}

.opacity-10 {
    opacity: .1
}

.opacity-20 {
    opacity: .2
}

.opacity-70 {
    opacity: .7
}

.shadow {
    --tw-shadow: 0 1px 3px 0 rgba(0,0,0,.1),0 1px 2px -1px rgba(0,0,0,.1);
    --tw-shadow-colored: 0 1px 3px 0 var(--tw-shadow-color),0 1px 2px -1px var(--tw-shadow-color)
}

.shadow,.shadow-lg {
    box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)
}

.shadow-lg {
    --tw-shadow: 0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1);
    --tw-shadow-colored: 0 10px 15px -3px var(--tw-shadow-color),0 4px 6px -4px var(--tw-shadow-color)
}

.outline {
    outline-style: solid
}

.ring-1 {
    --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
    --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color)
}

.ring-1,.ring-2 {
    box-shadow: var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow,0 0 #0000)
}

.ring-2 {
    --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
    --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color)
}

.ring-base-content {
    --tw-ring-opacity: 1;
    --tw-ring-color: var(--fallback-bc,oklch(var(--bc)/var(--tw-ring-opacity)))
}

.ring-primary {
    --tw-ring-opacity: 1;
    --tw-ring-color: var(--fallback-p,oklch(var(--p)/var(--tw-ring-opacity)))
}

.ring-transparent {
    --tw-ring-color: transparent
}

.ring-offset-2 {
    --tw-ring-offset-width: 2px
}

.filter {
    filter: var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)
}

.transition {
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-duration: .15s
}

.transition-\[width\] {
    transition-property: width;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-duration: .15s
}

.transition-all {
    transition-property: all;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-duration: .15s
}

.transition-opacity {
    transition-property: opacity;
    transition-timing-function: cubic-bezier(.4,0,.2,1);
    transition-duration: .15s
}

.duration-1000 {
    transition-duration: 1s
}

.duration-300 {
    transition-duration: .3s
}

.ease-out {
    transition-timing-function: cubic-bezier(0,0,.2,1)
}

.\[appearance\:textfield\] {
    -webkit-appearance: textfield;
    -moz-appearance: textfield;
    appearance: textfield
}

.group:disabled .group-disabled\:animate-progress {
    animation: progress-frame ease normal
}

@keyframes progress-frame {
    0% {
        --dot-progress: 0%
    }

    to {
        --dot-progress: 100%
    }
}

.invalid\:input-error:invalid {
    --tw-border-opacity: 1;
    border-color: var(--fallback-er,oklch(var(--er)/var(--tw-border-opacity)))
}

.invalid\:input-error:invalid:focus,.invalid\:input-error:invalid:focus-within {
    --tw-border-opacity: 1;
    border-color: var(--fallback-er,oklch(var(--er)/var(--tw-border-opacity)));
    outline-color: var(--fallback-er,oklch(var(--er)/1))
}

.has-\[\:invalid\]\:tooltip:has(:invalid) {
    --tooltip-offset: calc(100% + 1px + var(--tooltip-tail, 0px))
}

.has-\[\:invalid\]\:tooltip:has(:invalid):before {
    position: absolute;
    pointer-events: none;
    z-index: 1;
    content: var(--tw-content);
    --tw-content: attr(data-tip);
    transform: translateX(-50%);
    top: auto;
    left: 50%;
    right: auto;
    bottom: var(--tooltip-offset)
}

.has-\[\:invalid\]\:tooltip-bottom:has(:invalid):before {
    transform: translateX(-50%);
    top: var(--tooltip-offset);
    left: 50%;
    right: auto;
    bottom: auto
}

.has-\[\:invalid\]\:tooltip:has(:invalid) {
    position: relative;
    display: inline-block;
    text-align: center;
    --tooltip-tail: 0.1875rem;
    --tooltip-color: var(--fallback-n,oklch(var(--n)/1));
    --tooltip-text-color: var(--fallback-nc,oklch(var(--nc)/1));
    --tooltip-tail-offset: calc(100% + 0.0625rem - var(--tooltip-tail))
}

.has-\[\:invalid\]\:tooltip:has(:invalid):after,.has-\[\:invalid\]\:tooltip:has(:invalid):before {
    opacity: 0;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,-webkit-backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;
    transition-property: color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter,-webkit-backdrop-filter;
    transition-delay: .1s;
    transition-duration: .2s;
    transition-timing-function: cubic-bezier(.4,0,.2,1)
}

.has-\[\:invalid\]\:tooltip:has(:invalid):after {
    position: absolute;
    content: "";
    border-style: solid;
    border-width: var(--tooltip-tail,0);
    width: 0;
    height: 0;
    display: block
}

.has-\[\:invalid\]\:tooltip:has(:invalid):before {
    max-width: 20rem;
    border-radius: .25rem;
    padding: .25rem .5rem;
    font-size: .875rem;
    line-height: 1.25rem;
    background-color: var(--tooltip-color);
    color: var(--tooltip-text-color);
    width: -moz-max-content;
    width: max-content
}

.has-\[\:invalid\]\:tooltip:has(:invalid).tooltip-open:before {
    opacity: 1;
    transition-delay: 75ms
}

.has-\[\:invalid\]\:tooltip-open:has(:invalid).tooltip:before {
    opacity: 1;
    transition-delay: 75ms
}

.has-\[\:invalid\]\:tooltip:has(:invalid).tooltip-open:after {
    opacity: 1;
    transition-delay: 75ms
}

.has-\[\:invalid\]\:tooltip-open:has(:invalid).tooltip:after {
    opacity: 1;
    transition-delay: 75ms
}

.has-\[\:invalid\]\:tooltip:has(:invalid):hover:before {
    opacity: 1;
    transition-delay: 75ms
}

.has-\[\:invalid\]\:tooltip:has(:invalid):hover:after {
    opacity: 1;
    transition-delay: 75ms
}

.has-\[\:invalid\]\:tooltip:has(:invalid):has(:focus-visible):after,.has-\[\:invalid\]\:tooltip:has(:invalid):has(:focus-visible):before {
    opacity: 1;
    transition-delay: 75ms
}

.has-\[\:invalid\]\:tooltip:has(:invalid):not([data-tip]):hover:after,.has-\[\:invalid\]\:tooltip:has(:invalid):not([data-tip]):hover:before {
    visibility: hidden;
    opacity: 0
}

.has-\[\:invalid\]\:tooltip:has(:invalid):after {
    transform: translateX(-50%);
    border-color: var(--tooltip-color) transparent transparent transparent;
    top: auto;
    left: 50%;
    right: auto;
    bottom: var(--tooltip-tail-offset)
}

.has-\[\:invalid\]\:tooltip-bottom:has(:invalid):after {
    transform: translateX(-50%);
    border-color: transparent transparent var(--tooltip-color) transparent;
    top: var(--tooltip-tail-offset);
    left: 50%;
    right: auto;
    bottom: auto
}

.has-\[\:invalid\]\:tooltip-error:has(:invalid) {
    --tooltip-color: var(--fallback-er,oklch(var(--er)/1));
    --tooltip-text-color: var(--fallback-erc,oklch(var(--erc)/1))
}

@media (min-width: 640px) {
    .sm\:carousel-vertical {
        flex-direction:column;
        overflow-y: scroll;
        scroll-snap-type: y mandatory
    }

    .sm\:carousel-end .carousel-item {
        scroll-snap-align: end
    }
}

@media (min-width: 768px) {
    .md\:btn-sm {
        height:2rem;
        min-height: 2rem;
        padding-left: .75rem;
        padding-right: .75rem;
        font-size: .875rem
    }

    .btn-square:where(.md\:btn-sm) {
        height: 2rem;
        width: 2rem;
        padding: 0
    }

    .btn-circle:where(.md\:btn-sm) {
        height: 2rem;
        width: 2rem;
        border-radius: 9999px;
        padding: 0
    }
}

@media (min-width: 1024px) {
    .lg\:card-side {
        align-items:stretch;
        flex-direction: row
    }

    .lg\:card-side :where(figure:first-child) {
        overflow: hidden;
        border-start-start-radius: inherit;
        border-start-end-radius: unset;
        border-end-start-radius: inherit;
        border-end-end-radius: unset
    }

    .lg\:card-side :where(figure:last-child) {
        overflow: hidden;
        border-start-start-radius: unset;
        border-start-end-radius: inherit;
        border-end-start-radius: unset;
        border-end-end-radius: inherit
    }

    .lg\:card-side figure>* {
        max-width: unset
    }

    :where(.lg\:card-side figure>*) {
        width: 100%;
        height: 100%;
        -o-object-fit: cover;
        object-fit: cover
    }
}

@media (min-width: 1280px) {
    .xl\:container {
        width:100%;
        margin-right: auto;
        margin-left: auto
    }

    @media (min-width: 640px) {
        .xl\:container {
            max-width:640px
        }
    }

    @media (min-width: 768px) {
        .xl\:container {
            max-width:768px
        }
    }

    @media (min-width: 1024px) {
        .xl\:container {
            max-width:1024px
        }
    }

    @media (min-width: 1280px) {
        .xl\:container {
            max-width:1280px
        }
    }

    @media (min-width: 1536px) {
        .xl\:container {
            max-width:1536px
        }
    }
}

.first\:ml-4:first-child {
    margin-left: 1rem
}

.first\:pl-5:first-child {
    padding-left: 1.25rem
}

.last\:mr-4:last-child {
    margin-right: 1rem
}

.last\:pr-5:last-child {
    padding-right: 1.25rem
}

.hover\:flex:hover {
    display: flex
}

.hover\:scale-125:hover {
    --tw-scale-x: 1.25;
    --tw-scale-y: 1.25;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.hover\:rounded:hover {
    border-radius: .25rem
}

.hover\:border-\[\#C9CFCF\]:hover {
    --tw-border-opacity: 1;
    border-color: rgb(201 207 207/var(--tw-border-opacity))
}

.hover\:border-primary:hover {
    --tw-border-opacity: 1;
    border-color: var(--fallback-p,oklch(var(--p)/var(--tw-border-opacity)))
}

.hover\:\!bg-transparent:hover {
    background-color: transparent!important
}

.hover\:bg-base-200:hover {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b2,oklch(var(--b2)/var(--tw-bg-opacity)))
}

.hover\:bg-gradient-to-r:hover {
    background-image: linear-gradient(to right,var(--tw-gradient-stops))
}

.hover\:\!text-error:hover {
    --tw-text-opacity: 1!important;
    color: var(--fallback-er,oklch(var(--er)/var(--tw-text-opacity)))!important
}

.hover\:\!text-primary:hover {
    --tw-text-opacity: 1!important;
    color: var(--fallback-p,oklch(var(--p)/var(--tw-text-opacity)))!important
}

.hover\:text-accent-content:hover {
    --tw-text-opacity: 1;
    color: var(--fallback-ac,oklch(var(--ac)/var(--tw-text-opacity)))
}

.hover\:underline:hover {
    text-decoration-line: underline
}

.focus\:outline-none:focus {
    outline: 2px solid transparent;
    outline-offset: 2px
}

.disabled\:invisible:disabled {
    visibility: hidden
}

.disabled\:w-8:disabled {
    width: 2rem
}

.disabled\:\!bg-transparent:disabled {
    background-color: transparent!important
}

.disabled\:bg-base-100:disabled {
    --tw-bg-opacity: 1;
    background-color: var(--fallback-b1,oklch(var(--b1)/var(--tw-bg-opacity)))
}

.disabled\:\!text-error:disabled {
    --tw-text-opacity: 1!important;
    color: var(--fallback-er,oklch(var(--er)/var(--tw-text-opacity)))!important
}

.disabled\:\!text-primary:disabled {
    --tw-text-opacity: 1!important;
    color: var(--fallback-p,oklch(var(--p)/var(--tw-text-opacity)))!important
}

.disabled\:\!opacity-50:disabled {
    opacity: .5!important
}

.disabled\:\!opacity-75:disabled {
    opacity: .75!important
}

.disabled\:opacity-100:disabled {
    opacity: 1
}

.group[open] .group-open\:font-semibold {
    font-weight: 600
}

.group:hover .group-hover\:flex {
    display: flex
}

.group:hover .group-hover\:-translate-x-40 {
    --tw-translate-x: -10rem;
    transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
}

.group:hover .group-hover\:border-primary {
    --tw-border-opacity: 1;
    border-color: var(--fallback-p,oklch(var(--p)/var(--tw-border-opacity)))
}

.group:hover .group-hover\:underline {
    text-decoration-line: underline
}

.group:hover .group-hover\:opacity-100 {
    opacity: 1
}

.peer:checked~.peer-checked\:flex {
    display: flex
}

.peer:checked~.peer-checked\:hidden {
    display: none
}

@media (min-width: 640px) {
    .sm\:bottom-2 {
        bottom:.5rem
    }

    .sm\:left-40 {
        left: 10rem
    }

    .sm\:col-span-2 {
        grid-column: span 2/span 2
    }

    .sm\:col-span-3 {
        grid-column: span 3/span 3
    }

    .sm\:col-start-2 {
        grid-column-start: 2
    }

    .sm\:mx-0 {
        margin-left: 0;
        margin-right: 0
    }

    .sm\:mx-auto {
        margin-left: auto;
        margin-right: auto
    }

    .sm\:mt-10 {
        margin-top: 2.5rem
    }

    .sm\:mt-6 {
        margin-top: 1.5rem
    }

    .sm\:mt-8 {
        margin-top: 2rem
    }

    .sm\:flex {
        display: flex
    }

    .sm\:inline-flex {
        display: inline-flex
    }

    .sm\:hidden {
        display: none
    }

    .sm\:h-\[273px\] {
        height: 273px
    }

    .sm\:min-h-min {
        min-height: -moz-min-content;
        min-height: min-content
    }

    .sm\:w-\[300px\] {
        width: 300px
    }

    .sm\:w-\[522px\] {
        width: 522px
    }

    .sm\:w-\[552px\] {
        width: 552px
    }

    .sm\:max-w-96 {
        max-width: 24rem
    }

    .sm\:max-w-\[33\%\] {
        max-width: 33%
    }

    .sm\:max-w-\[440px\] {
        max-width: 440px
    }

    .sm\:max-w-\[450px\] {
        max-width: 450px
    }

    .sm\:max-w-\[488px\] {
        max-width: 488px
    }

    .sm\:grid-flow-col {
        grid-auto-flow: column
    }

    .sm\:grid-cols-2 {
        grid-template-columns: repeat(2,minmax(0,1fr))
    }

    .sm\:grid-cols-4 {
        grid-template-columns: repeat(4,minmax(0,1fr))
    }

    .sm\:grid-cols-5 {
        grid-template-columns: repeat(5,minmax(0,1fr))
    }

    .sm\:grid-cols-\[112px_1fr_112px\] {
        grid-template-columns: 112px 1fr 112px
    }

    .sm\:grid-cols-\[150px_1fr\] {
        grid-template-columns: 150px 1fr
    }

    .sm\:grid-cols-\[250px_1fr\] {
        grid-template-columns: 250px 1fr
    }

    .sm\:grid-cols-\[min-content_1fr\] {
        grid-template-columns: min-content 1fr
    }

    .sm\:grid-rows-1 {
        grid-template-rows: repeat(1,minmax(0,1fr))
    }

    .sm\:flex-row {
        flex-direction: row
    }

    .sm\:flex-wrap {
        flex-wrap: wrap
    }

    .sm\:items-start {
        align-items: flex-start
    }

    .sm\:items-end {
        align-items: flex-end
    }

    .sm\:items-center {
        align-items: center
    }

    .sm\:justify-center {
        justify-content: center
    }

    .sm\:gap-10 {
        gap: 2.5rem
    }

    .sm\:gap-2 {
        gap: .5rem
    }

    .sm\:gap-20 {
        gap: 5rem
    }

    .sm\:gap-4 {
        gap: 1rem
    }

    .sm\:gap-5 {
        gap: 1.25rem
    }

    .sm\:gap-6 {
        gap: 1.5rem
    }

    .sm\:overflow-y-auto {
        overflow-y: auto
    }

    .sm\:p-0 {
        padding: 0
    }

    .sm\:p-10 {
        padding: 2.5rem
    }

    .sm\:px-0 {
        padding-left: 0;
        padding-right: 0
    }

    .sm\:px-10 {
        padding-left: 2.5rem;
        padding-right: 2.5rem
    }

    .sm\:py-10 {
        padding-top: 2.5rem;
        padding-bottom: 2.5rem
    }

    .sm\:py-5 {
        padding-top: 1.25rem;
        padding-bottom: 1.25rem
    }

    .sm\:pb-10 {
        padding-bottom: 2.5rem
    }

    .sm\:pt-10 {
        padding-top: 2.5rem
    }

    .sm\:text-start {
        text-align: start
    }

    .sm\:text-3xl {
        font-size: 1.875rem;
        line-height: 2.25rem
    }

    .first\:sm\:pl-0:first-child {
        padding-left: 0
    }

    .last\:sm\:pr-0:last-child {
        padding-right: 0
    }
}

@media (min-width: 768px) {
    .md\:mx-10 {
        margin-left:2.5rem;
        margin-right: 2.5rem
    }

    .md\:max-w-\[50\%\] {
        max-width: 50%
    }

    .md\:max-w-xs {
        max-width: 20rem
    }

    .md\:scale-\[30\%\] {
        --tw-scale-x: 30%;
        --tw-scale-y: 30%;
        transform: translate(var(--tw-translate-x),var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))
    }

    .md\:grid-cols-2 {
        grid-template-columns: repeat(2,minmax(0,1fr))
    }

    .md\:gap-20 {
        gap: 5rem
    }

    .md\:px-\[60px\] {
        padding-left: 60px;
        padding-right: 60px
    }

    .md\:py-20 {
        padding-top: 5rem;
        padding-bottom: 5rem
    }

    .md\:py-24 {
        padding-top: 6rem;
        padding-bottom: 6rem
    }

    .md\:pt-0 {
        padding-top: 0
    }

    .md\:text-2xl {
        font-size: 1.5rem;
        line-height: 2rem
    }

    .md\:text-8xl {
        font-size: 6rem;
        line-height: 1
    }

    .md\:text-\[18px\] {
        font-size: 18px
    }

    .md\:text-base {
        font-size: 1rem;
        line-height: 1.5rem
    }

    .md\:text-sm {
        font-size: .875rem;
        line-height: 1.25rem
    }
}

@media (min-width: 1024px) {
    .lg\:mx-auto {
        margin-left:auto;
        margin-right: auto
    }

    .lg\:grid {
        display: grid
    }

    .lg\:max-h-\[600px\] {
        max-height: 600px
    }

    .lg\:w-1\/2 {
        width: 50%
    }

    .lg\:w-full {
        width: 100%
    }

    .lg\:max-w-3xl {
        max-width: 48rem
    }

    .lg\:max-w-lg {
        max-width: 32rem
    }

    .lg\:max-w-xl {
        max-width: 36rem
    }

    .lg\:flex-\[100px\] {
        flex: 100px
    }

    .lg\:grid-cols-2 {
        grid-template-columns: repeat(2,minmax(0,1fr))
    }

    .lg\:flex-row {
        flex-direction: row
    }

    .lg\:flex-row-reverse {
        flex-direction: row-reverse
    }

    .lg\:items-start {
        align-items: flex-start
    }

    .lg\:items-center {
        align-items: center
    }

    .lg\:justify-normal {
        justify-content: normal
    }

    .lg\:justify-center {
        justify-content: center
    }

    .lg\:gap-16 {
        gap: 4rem
    }

    .lg\:px-8 {
        padding-left: 2rem;
        padding-right: 2rem
    }

    .lg\:py-3 {
        padding-top: .75rem;
        padding-bottom: .75rem
    }

    .lg\:py-36 {
        padding-top: 9rem;
        padding-bottom: 9rem
    }

    .lg\:text-left {
        text-align: left
    }

    .lg\:text-2xl {
        font-size: 1.5rem;
        line-height: 2rem
    }

    .lg\:text-3xl {
        font-size: 1.875rem;
        line-height: 2.25rem
    }

    .lg\:text-\[20px\] {
        font-size: 20px
    }

    .lg\:text-xl {
        font-size: 1.25rem;
        line-height: 1.75rem
    }

    .group:hover .lg\:group-hover\:opacity-100 {
        opacity: 1
    }
}

@media (min-width: 1280px) {
    .xl\:mx-auto {
        margin-left:auto;
        margin-right: auto
    }
}

.\[\&_section\]\:contents section {
    display: contents
}

.htmx-request .\[\.htmx-request_\&\]\:pointer-events-none {
    pointer-events: none
}

.htmx-request .\[\.htmx-request_\&\]\:block {
    display: block
}

.htmx-request .\[\.htmx-request_\&\]\:inline {
    display: inline
}

.htmx-request .\[\.htmx-request_\&\]\:hidden {
    display: none
}

.htmx-request .\[\.htmx-request_\&\]\:cursor-wait {
    cursor: wait
}

.htmx-request .\[\.htmx-request_\&\]\:opacity-0 {
    opacity: 0
}

.htmx-request .\[\.htmx-request_\&\]\:opacity-100 {
    opacity: 1
}

.htmx-request .\[\.htmx-request_\&\]\:opacity-60 {
    opacity: .6
}

[data-aside].\[\[data-aside\]\&_section\]\:contents section {
    display: contents
}
`
// deno-lint-ignore no-explicit-any
export interface PageParams<TData = any> {
    data: TData;
    url: URL;
    params: Record<string, string>;
}
let socket: null | WebSocket = null;
const routes: Array<
    {
        paths: string[];
        handler: DecoHandler;
        Component?: ComponentType<PageParams>;
    }
> = [
    {
        paths: ["/live/_meta", "/deco/meta"],
        handler: metaHandler,
    },
    {
        paths: ["/live/release", "/.decofile"],
        handler: releaseHandler,
    },
    {
        paths: ["/live/inspect/:block", "/deco/inspect/:block"],
        handler: inspectHandler,
    },
    {
        paths: ["/live/invoke", "/deco/invoke"],
        handler: invokeHandler,
    },
    {
        paths: ["/live/invoke/*", "/deco/invoke/*"],
        handler: invokeKeyHandler,
    },
    {
        paths: ["/live/previews", "/deco/previews"],
        handler: previewsHandler,
        Component: PreviewsPage,
    },
    {
        paths: ["/live/previews/*", "/deco/previews/*"],
        Component: PreviewPage,
        handler: previewHandler,
    },
    {
        paths: ["/live/workflows/run", "/deco/workflows/run"],
        handler: workflowHandler,
    },
    {
        paths: ["/deco/render"],
        handler: renderHandler,
        Component: Render,
    },
    {
        paths: ["/", "*"],
        handler: entrypoint,
        Component: Render,
    },
];

export type { DecoRouteState };
export const setup = async <
    TAppManifest extends AppManifest = AppManifest,
    THonoState extends DecoRouteState<TAppManifest> = DecoRouteState<
        TAppManifest
    >,
>(
    hono: Hono<THonoState>,
) => {
    const manifest = await import(
        import.meta.resolve(join(Deno.cwd(), "manifest.gen.ts"))
    ).then((mod) => mod.default);
    hono.use(
        liveness,
        contextProvider({ manifest }),
        alienRelease,
        decod,
        buildDecoState(),
        ...main,
    );
    hono.get(
        DEV_SERVER_PATH,
        upgradeWebSocket(() => {
            return {
                onOpen: (_, ws) => {
                    socket = ws.raw as WebSocket ?? null;
                },
                onClose: () => {
                    socket = null;
                },
            };
        }),
    );
    const staticHandlers: Record<string, MiddlewareHandler> = {};
    for (const { paths, handler, Component } of routes) {
        for (const path of paths) {
            hono.all(path, (ctx, next) => {
                const s = new URL(ctx.req.url);

                if (s.searchParams.has("__frsh_c")) {
                    staticHandlers[ctx.req.path] ??= serveStatic({
                        path: `/static/${ctx.req.path}`,
                    });
                    return staticHandlers[ctx.req.path](
                        ctx,
                        next,
                    );
                }
                if (Component) {
                    ctx.setRenderer((data) => {
                        const original = options.vnode;
                        const htmlHead: ComponentChildren[] = [];
                        options.vnode = (vnode) => {
                            if (vnode.type === Head) {
                                htmlHead.push(vnode.props.children);
                            }
                            return original?.(vnode);
                        };
                        const body = renderToString(
                            <>
                                {!context.isDeploy ? DEV_SERVER_SCRIPT : null}
                                <Component
                                    params={ctx.req.param()}
                                    url={new URL(ctx.req.url)}
                                    data={data}
                                />
                            </>,
                        );
                        return Promise.resolve(
                            new Response(
                                `<html>\n<head><style>${styles}</style><script src="https://cdn.tailwindcss.com/?plugins=forms,typography,aspect-ratio,line-clamp,container-queries"></script><script src="https://cdn.tailwindcss.com"></script>${
                                    renderToString(
                                        <>
                                            {((htmlHead ??
                                                []) as ComponentChildren[]).map(
                                                    (child) => (
                                                        <>
                                                            {child}
                                                        </>
                                                    ),
                                                )}
                                        </>,
                                    )
                                }</head>\n<body>${body}</body>\n</html>`,
                                {
                                    status: 200,
                                    headers: { "Content-Type": "text/html" },
                                },
                            ),
                        );
                    });
                }
                // deno-lint-ignore no-explicit-any
                return handler(ctx as any, next);
            });
        }
    }
};

addEventListener("hmr", () => {
    if (socket) {
        socket.send("refresh");
    }
});
