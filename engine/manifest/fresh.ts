import type { ResolverMap } from "../../engine/core/resolver.ts";
import defaultResolvers from "../../engine/manifest/defaults.ts";
import type { RouteContext } from "../../engine/manifest/manifest.ts";

const freshResolvers = {
  ...defaultResolvers,
  render: function render(props, { context: { render } }) {
    return render(props);
  },
} satisfies ResolverMap<RouteContext>;

export default freshResolvers;
