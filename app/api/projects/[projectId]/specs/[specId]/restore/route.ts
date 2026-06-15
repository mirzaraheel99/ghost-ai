import { get } from "@vercel/blob"
import { LiveObject } from "@liveblocks/client"
import type { LiveblocksNode, LiveblocksEdge } from "@liveblocks/react-flow"
import { prisma } from "@/lib/prisma"
import { getLiveblocks } from "@/lib/liveblocks"
import { getCurrentProjectIdentity, userHasProjectAccess } from "@/lib/project-access"
import { NODE_SYNC_CONFIG, EDGE_SYNC_CONFIG } from "@/types/canvas"
import type { CanvasNode, CanvasEdge, CanvasSnapshot } from "@/types/canvas"
import type { NextRequest } from "next/server"

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ projectId: string; specId: string }> }
) {
  const identity = await getCurrentProjectIdentity()
  if (!identity.userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { projectId, specId } = await ctx.params

  const hasAccess = await userHasProjectAccess(projectId, identity)
  if (!hasAccess) return Response.json({ error: "Not found" }, { status: 404 })

  const spec = await prisma.projectSpec.findFirst({
    where: { id: specId, projectId },
  })
  if (!spec) return Response.json({ error: "Not found" }, { status: 404 })
  if (!spec.canvasSnapshotUrl) {
    return Response.json({ error: "No canvas snapshot for this spec" }, { status: 400 })
  }

  const result = await get(spec.canvasSnapshotUrl, { access: "private" })
  if (!result || result.statusCode !== 200 || !result.stream) {
    return Response.json({ error: "Snapshot not found" }, { status: 404 })
  }

  const snapshot = (await new Response(result.stream).json()) as CanvasSnapshot

  const lb = getLiveblocks()

  await lb.mutateStorage(projectId, ({ root }) => {
    const flow = root.get("flow")
    if (!flow) return

    const nodes = flow.get("nodes")
    const edges = flow.get("edges")

    for (const key of [...nodes.keys()]) nodes.delete(key)
    for (const key of [...edges.keys()]) edges.delete(key)

    for (const node of snapshot.nodes ?? []) {
      nodes.set(
        node.id,
        LiveObject.from(node as never, NODE_SYNC_CONFIG) as unknown as LiveblocksNode<CanvasNode>
      )
    }

    for (const edge of snapshot.edges ?? []) {
      edges.set(
        edge.id,
        LiveObject.from(edge as never, EDGE_SYNC_CONFIG) as unknown as LiveblocksEdge<CanvasEdge>
      )
    }
  })

  return Response.json({ success: true, version: spec.version })
}
