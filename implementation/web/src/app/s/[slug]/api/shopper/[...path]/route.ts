import { handleShopperProxyRequest } from "@/lib/shopper-proxy";

interface RouteContext {
  params: Promise<{ slug: string; path: string[] }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { slug, path } = await context.params;
  return handleShopperProxyRequest(request, {
    storeSlug: slug,
    pathSegments: path,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { slug, path } = await context.params;
  return handleShopperProxyRequest(request, {
    storeSlug: slug,
    pathSegments: path,
  });
}
