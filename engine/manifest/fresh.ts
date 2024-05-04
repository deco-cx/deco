import { ResolverMap } from "../../engine/core/resolver.ts";
import { FreshContext } from "../../engine/manifest/manifest.ts";
import defaultResolvers from "../../engine/manifest/defaults.ts";

const freshResolvers = {
  ...defaultResolvers,
  render: function render(props, { context: { render } }) {
    return render(props);
  },
} satisfies ResolverMap<FreshContext>;

export default freshResolvers;
