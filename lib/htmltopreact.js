// Originally based on https://github.com/reactjs/react-magic/blob/master/src/htmltojsx.js
import HTMLDOMPropertyConfig from "https://esm.sh/react-dom-core@0.1.2/lib/HTMLDOMPropertyConfig";
import SVGDOMPropertyConfig from "https://esm.sh/react-dom-core@0.1.2/lib/SVGDOMPropertyConfig";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

// https://developer.mozilla.org/en-US/docs/Web/API/Node.nodeType
const NODE_TYPE = {
  ELEMENT: 1,
  TEXT: 3,
  COMMENT: 8,
};

const ATTRIBUTE_MAPPING = {
  "for": "for",
  "class": "class",
  "viewbox": "viewBox",
};

const ELEMENT_ATTRIBUTE_MAPPING = {
  "input": {
    "checked": "checked",
    "value": "value",
    "autofocus": "autoFocus",
  },
};

// Reference: https://developer.mozilla.org/en-US/docs/Web/SVG/Element#SVG_elements
const ELEMENT_TAG_NAME_MAPPING = {
  a: "a",
  altglyph: "altGlyph",
  altglyphdef: "altGlyphDef",
  altglyphitem: "altGlyphItem",
  animate: "animate",
  animatecolor: "animateColor",
  animatemotion: "animateMotion",
  animatetransform: "animateTransform",
  audio: "audio",
  canvas: "canvas",
  circle: "circle",
  clippath: "clipPath",
  "color-profile": "colorProfile",
  cursor: "cursor",
  defs: "defs",
  desc: "desc",
  discard: "discard",
  ellipse: "ellipse",
  feblend: "feBlend",
  fecolormatrix: "feColorMatrix",
  fecomponenttransfer: "feComponentTransfer",
  fecomposite: "feComposite",
  feconvolvematrix: "feConvolveMatrix",
  fediffuselighting: "feDiffuseLighting",
  fedisplacementmap: "feDisplacementMap",
  fedistantlight: "feDistantLight",
  fedropshadow: "feDropShadow",
  feflood: "feFlood",
  fefunca: "feFuncA",
  fefuncb: "feFuncB",
  fefuncg: "feFuncG",
  fefuncr: "feFuncR",
  fegaussianblur: "feGaussianBlur",
  feimage: "feImage",
  femerge: "feMerge",
  femergenode: "feMergeNode",
  femorphology: "feMorphology",
  feoffset: "feOffset",
  fepointlight: "fePointLight",
  fespecularlighting: "feSpecularLighting",
  fespotlight: "feSpotLight",
  fetile: "feTile",
  feturbulence: "feTurbulence",
  filter: "filter",
  font: "font",
  "font-face": "fontFace",
  "font-face-format": "fontFaceFormat",
  "font-face-name": "fontFaceName",
  "font-face-src": "fontFaceSrc",
  "font-face-uri": "fontFaceUri",
  foreignobject: "foreignObject",
  g: "g",
  glyph: "glyph",
  glyphref: "glyphRef",
  hatch: "hatch",
  hatchpath: "hatchpath",
  hkern: "hkern",
  iframe: "iframe",
  image: "image",
  line: "line",
  lineargradient: "linearGradient",
  marker: "marker",
  mask: "mask",
  mesh: "mesh",
  meshgradient: "meshgradient",
  meshpatch: "meshpatch",
  meshrow: "meshrow",
  metadata: "metadata",
  "missing-glyph": "missingGlyph",
  mpath: "mpath",
  path: "path",
  pattern: "pattern",
  polygon: "polygon",
  polyline: "polyline",
  radialgradient: "radialGradient",
  rect: "rect",
  script: "script",
  set: "set",
  solidcolor: "solidcolor",
  stop: "stop",
  style: "style",
  svg: "svg",
  switch: "switch",
  symbol: "symbol",
  text: "text",
  textpath: "textPath",
  title: "title",
  tref: "tref",
  tspan: "tspan",
  unknown: "unknown",
  use: "use",
  video: "video",
  view: "view",
  vkern: "vkern",
};

/**
 * Iterates over elements of object invokes iteratee for each element
 *
 * @param {object}   obj        Collection object
 * @param {function} iteratee   Callback function called in iterative processing
 * @param {any}      context    This arg (aka Context)
 */
function eachObj(obj, iteratee, context) {
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      iteratee.call(context || obj, key, obj[key]);
    }
  }
}

// Populate property map with ReactJS's attribute and property mappings
// TODO handle/use .Properties value eg: MUST_USE_PROPERTY is not HTML attr
function mappingAttributesFromReactConfig(config) {
  eachObj(config.Properties, function (propname) {
    let mapFrom = config.DOMAttributeNames[propname] || propname.toLowerCase();

    if (!ATTRIBUTE_MAPPING[mapFrom]) {
      ATTRIBUTE_MAPPING[mapFrom] = propname;
    }
  });
}

mappingAttributesFromReactConfig(HTMLDOMPropertyConfig);
mappingAttributesFromReactConfig(SVGDOMPropertyConfig);

/**
 * Convert tag name to tag name suitable for JSX.
 *
 * @param  {string} tagName  String of tag name
 * @return {string}
 */
function jsxTagName(tagName) {
  let name = tagName.toLowerCase();

  if (ELEMENT_TAG_NAME_MAPPING.hasOwnProperty(name)) {
    name = ELEMENT_TAG_NAME_MAPPING[name];
  }

  return name;
}

/**
 * Convert a hyphenated string to camelCase.
 */
function hyphenToCamelCase(string) {
  return string.replace(/-(.)/g, function (match, chr) {
    return chr.toUpperCase();
  });
}

/**
 * Determines if the specified string consists entirely of whitespace.
 */
function isEmpty(string) {
  return !/[^\s]/.test(string);
}

/**
 * Determines if the specified string consists entirely of numeric characters.
 */
function isNumeric(input) {
  return input !== undefined &&
    input !== null &&
    (typeof input === "number" || parseInt(input, 10) == input);
}

const document = new DOMParser().parseFromString(
  "<html><body></body></html>",
  "text/html",
);

const createElement = document.createElement.bind(document);

const tempEl = createElement("div");
/**
 * Escapes special characters by converting them to their escaped equivalent
 * (eg. "<" to "&lt;"). Only escapes characters that absolutely must be escaped.
 *
 * @param {string} value
 * @return {string}
 */
function escapeSpecialChars(value) {
  // Uses this One Weird Trick to escape text - Raw text inserted as textContent
  // will have its escaped version in innerHTML.
  tempEl.textContent = value;
  return tempEl.innerHTML;
}

const prefix = `import { Fragment, h } from "preact";`;

export const HTMLtoJSX = function (config) {
  this.config = config || {};
};
HTMLtoJSX.prototype = {
  /**
   * Reset the internal state of the converter
   */
  reset: function () {
    this.output = "";
    this.level = 0;
    this._inPreTag = false;
  },
  /**
   * Main entry point to the converter. Given the specified HTML, returns a
   * JSX object representing it.
   * @param {string} html HTML to convert
   * @return {string} JSX
   */
  convert: function (html) {
    this.reset();

    const containerEl = createElement("div");
    containerEl.innerHTML = "\n" + this._cleanInput(html) + "\n";

    this.output = prefix;

    if (this.config.name) {
      this.output += "export default function " + this.config.name + "() {";
    } else {
      this.output += "export default function() {\n";
    }
    this.output += "return (\n";

    if (this._onlyOneTopLevel(containerEl)) {
      // Only one top-level element, the component can return it directly
      // No need to actually visit the container element
      this._traverse(containerEl);
    } else {
      // More than one top-level element, need to wrap the whole thing in a
      // container.
      this.level++;
      this._visit(containerEl);
    }
    this.output = this.output.trim() + ")\n";
    this.output += "};\n";
    return this.output;
  },

  /**
   * Cleans up the specified HTML so it's in a format acceptable for
   * converting.
   *
   * @param {string} html HTML to clean
   * @return {string} Cleaned HTML
   */
  _cleanInput: function (html) {
    // Remove unnecessary whitespace
    html = html.trim();
    // Ugly method to strip script tags. They can wreak havoc on the DOM nodes
    // so let's not even put them in the DOM.
    html = html.replace(/<script([\s\S]*?)<\/script>/g, "");
    return html;
  },

  /**
   * Determines if there's only one top-level node in the DOM tree. That is,
   * all the HTML is wrapped by a single HTML tag.
   *
   * @param {DOMElement} containerEl Container element
   * @return {boolean}
   */
  _onlyOneTopLevel: function (containerEl) {
    // Only a single child element
    if (
      containerEl.childNodes.length === 1 &&
      containerEl.childNodes[0].nodeType === NODE_TYPE.ELEMENT
    ) {
      return true;
    }
    // Only one element, and all other children are whitespace
    let foundElement = false;
    for (let i = 0, count = containerEl.childNodes.length; i < count; i++) {
      const child = containerEl.childNodes[i];
      if (child.nodeType === NODE_TYPE.ELEMENT) {
        if (foundElement) {
          // Encountered an element after already encountering another one
          // Therefore, more than one element at root level
          return false;
        } else {
          foundElement = true;
        }
      } else if (
        child.nodeType === NODE_TYPE.TEXT && !isEmpty(child.textContent)
      ) {
        // Contains text content
        return false;
      }
    }
    return true;
  },

  /**
   * Handles processing the specified node
   *
   * @param {Node} node
   */
  _visit: function (node) {
    this._beginVisit(node);
    this._traverse(node);
    this._endVisit(node);
  },

  /**
   * Traverses all the children of the specified node
   *
   * @param {Node} node
   */
  _traverse: function (node) {
    this.level++;
    for (let i = 0, count = node.childNodes.length; i < count; i++) {
      this._visit(node.childNodes[i]);
    }
    this.level--;
  },

  /**
   * Handle pre-visit behaviour for the specified node.
   *
   * @param {Node} node
   */
  _beginVisit: function (node) {
    switch (node.nodeType) {
      case NODE_TYPE.ELEMENT:
        this._beginVisitElement(node);
        break;

      case NODE_TYPE.TEXT:
        this._visitText(node);
        break;

      case NODE_TYPE.COMMENT:
        this._visitComment(node);
        break;

      default:
        console.warn("Unrecognised node type: " + node.nodeType);
    }
  },

  /**
   * Handles post-visit behaviour for the specified node.
   *
   * @param {Node} node
   */
  _endVisit: function (node) {
    switch (node.nodeType) {
      case NODE_TYPE.ELEMENT:
        this._endVisitElement(node);
        break;
      // No ending tags required for these types
      case NODE_TYPE.TEXT:
      case NODE_TYPE.COMMENT:
        break;
    }
  },

  /**
   * Handles pre-visit behaviour for the specified element node
   *
   * @param {DOMElement} node
   */
  _beginVisitElement: function (node) {
    const tagName = jsxTagName(node.tagName);
    const attributes = [];
    for (let i = 0, count = node.attributes.length; i < count; i++) {
      attributes.push(this._getElementAttribute(node, node.attributes[i]));
    }

    if (tagName === "textarea") {
      // Hax: textareas need their inner text moved to a "defaultValue" attribute.
      attributes.push("defaultValue={" + JSON.stringify(node.value) + "}");
    }
    if (tagName === "style") {
      // Hax: style tag contents need to be dangerously set due to liberal curly brace usage
      attributes.push(
        "dangerouslySetInnerHTML={{__html: " +
          JSON.stringify(node.textContent) + " }}",
      );
    }
    if (tagName === "pre") {
      this._inPreTag = true;
    }

    this.output += "<" + tagName;
    if (attributes.length > 0) {
      this.output += " " + attributes.join(" ");
    }
    if (!this._isSelfClosing(node)) {
      this.output += ">";
    }
  },

  /**
   * Handles post-visit behaviour for the specified element node
   *
   * @param {Node} node
   */
  _endVisitElement: function (node) {
    const tagName = jsxTagName(node.tagName);
    if (this._isSelfClosing(node)) {
      this.output += " />";
    } else {
      this.output += "</" + tagName + ">";
    }

    if (tagName === "pre") {
      this._inPreTag = false;
    }
  },

  /**
   * Determines if this element node should be rendered as a self-closing
   * tag.
   *
   * @param {Node} node
   * @return {boolean}
   */
  _isSelfClosing: function (node) {
    const tagName = jsxTagName(node.tagName);
    // If it has children, it's not self-closing
    // Exception: All children of a textarea are moved to a "defaultValue" attribute, style attributes are dangerously set.
    return !node.firstChild || tagName === "textarea" || tagName === "style";
  },

  /**
   * Handles processing of the specified text node
   *
   * @param {TextNode} node
   */
  _visitText: function (node) {
    const parentTag = node.parentNode && jsxTagName(node.parentNode.tagName);
    if (parentTag === "textarea" || parentTag === "style") {
      // Ignore text content of textareas and styles, as it will have already been moved
      // to a "defaultValue" attribute and "dangerouslySetInnerHTML" attribute respectively.
      return;
    }

    let text = escapeSpecialChars(node.textContent);

    if (this._inPreTag) {
      // If this text is contained within a <pre>, we need to ensure the JSX
      // whitespace coalescing rules don't eat the whitespace. This means
      // wrapping newlines and sequences of two or more spaces in constiables.
      text = text
        .replace(/\r/g, "")
        .replace(/( {2,}|\n|\t|\{|\})/g, function (whitespace) {
          return "{" + JSON.stringify(whitespace) + "}";
        });
    } else {
      // Handle any curly braces.
      text = text
        .replace(/(\{|\})/g, function (brace) {
          return "{'" + brace + "'}";
        });
    }
    this.output += text;
  },

  /**
   * Handles processing of the specified text node
   *
   * @param {Text} node
   */
  _visitComment: function (node) {
    this.output += "{/*" + node.textContent.replace("*/", "* /") + "*/}";
  },

  /**
   * Gets a JSX formatted version of the specified attribute from the node
   *
   * @param {DOMElement} node
   * @param {object}     attribute
   * @return {string}
   */
  _getElementAttribute: function (node, attribute) {
    switch (attribute.name) {
      case "style":
        return this._getStyleAttribute(attribute.value);
      default: {
        const tagName = jsxTagName(node.tagName);
        const name = (ELEMENT_ATTRIBUTE_MAPPING[tagName] &&
          ELEMENT_ATTRIBUTE_MAPPING[tagName][attribute.name]) ||
          ATTRIBUTE_MAPPING[attribute.name] ||
          attribute.name;
        let result = name;

        // Numeric values should be output as {123} not "123"
        if (isNumeric(attribute.value)) {
          result += "={" + attribute.value + "}";
        } else if (attribute.value.length > 0) {
          result += '="' + attribute.value.replace(/"/gm, "&quot;") + '"';
        } else if (attribute.value.length === 0 && attribute.name === "alt") {
          result += '=""';
        }
        return result;
      }
    }
  },

  /**
   * Gets a JSX formatted version of the specified element styles
   *
   * @param {string} styles
   * @return {string}
   */
  _getStyleAttribute: function (styles) {
    const jsxStyles = new StyleParser(styles).toJSXString();
    return "style={{" + jsxStyles + "}}";
  },
};

/**
 * Handles parsing of inline styles
 *
 * @param {string} rawStyle Raw style attribute
 * @constructor
 */
const StyleParser = function (rawStyle) {
  this.parse(rawStyle);
};
StyleParser.prototype = {
  /**
   * Parse the specified inline style attribute value
   * @param {string} rawStyle Raw style attribute
   */
  parse: function (rawStyle) {
    this.styles = {};
    rawStyle.split(";").forEach(function (style) {
      style = style.trim();
      const firstColon = style.indexOf(":");
      let key = style.substr(0, firstColon);
      const value = style.substr(firstColon + 1).trim();
      if (key !== "") {
        // Style key should be case insensitive
        key = key.toLowerCase();
        this.styles[key] = value;
      }
    }, this);
  },

  /**
   * Convert the style information represented by this parser into a JSX
   * string
   *
   * @return {string}
   */
  toJSXString: function () {
    const output = [];
    eachObj(this.styles, function (key, value) {
      output.push(this.toJSXKey(key) + ": " + this.toJSXValue(value));
    }, this);
    return output.join(", ");
  },

  /**
   * Convert the CSS style key to a JSX style key
   *
   * @param {string} key CSS style key
   * @return {string} JSX style key
   */
  toJSXKey: function (key) {
    // Don't capitalize -ms- prefix
    if (/^-ms-/.test(key)) {
      key = key.substr(1);
    }
    return hyphenToCamelCase(key);
  },

  /**
   * Convert the CSS style value to a JSX style value
   *
   * @param {string} value CSS style value
   * @return {string} JSX style value
   */
  toJSXValue: function (value) {
    if (isNumeric(value)) {
      // If numeric, no quotes
      return value;
    } else {
      // Probably a string, wrap it in quotes
      return "'" + value.replace(/'/g, '"') + "'";
    }
  },
};

