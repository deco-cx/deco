import type { ResolverMap } from "../../engine/core/resolver.ts";
import defaultResolvers from "../../engine/manifest/defaults.ts";
import type { FreshContext } from "../../engine/manifest/manifest.ts";

const freshResolvers = {
  ...defaultResolvers,
  render: {
    invoke: function render(props, { context: { render } }) {
      return render(props);
    },
  },
} satisfies ResolverMap<FreshContext>;

export default freshResolvers;
