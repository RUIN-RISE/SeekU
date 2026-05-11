import "dotenv/config";

import {
  createDatabaseConnection,
  graphEdges,
  graphNodeFeatures,
  sql,
  type SeekuDatabase
} from "@seeku/db";

interface ComputeNodeFeaturesSummary {
  status: "succeeded" | "failed";
  personsProcessed: number;
  featuresComputed: number;
  componentsFound: number;
  largestComponentSize: number;
  edgesProcessed: number;
  errors: string[];
}

// Union-Find for connected components
class UnionFind {
  private parent: Map<string, string> = new Map();
  private size: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.size.set(x, 1);
    }

    const p = this.parent.get(x)!;
    if (p !== x) {
      this.parent.set(x, this.find(p));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    const sizeX = this.size.get(rootX) ?? 1;
    const sizeY = this.size.get(rootY) ?? 1;

    if (sizeX < sizeY) {
      this.parent.set(rootX, rootY);
      this.size.set(rootY, sizeX + sizeY);
    } else {
      this.parent.set(rootY, rootX);
      this.size.set(rootX, sizeX + sizeY);
    }
  }

  getComponentSizes(): Map<string, number> {
    const components = new Map<string, number>();
    for (const [node, _] of this.parent) {
      const root = this.find(node);
      components.set(root, this.size.get(root) ?? 1);
    }
    return components;
  }
}

export async function computeNodeFeatures(): Promise<ComputeNodeFeaturesSummary> {
  const summary: ComputeNodeFeaturesSummary = {
    status: "succeeded",
    personsProcessed: 0,
    featuresComputed: 0,
    componentsFound: 0,
    largestComponentSize: 0,
    edgesProcessed: 0,
    errors: []
  };

  const ownedConnection = createDatabaseConnection();
  const db = ownedConnection.db;

  try {
    console.log("Loading edges from database...");

    // Load all edges
    const edges = await db
      .select({
        sourcePersonId: graphEdges.sourcePersonId,
        targetPersonId: graphEdges.targetPersonId,
        edgeType: graphEdges.edgeType
      })
      .from(graphEdges);

    console.log(`Loaded ${edges.length} edges.`);
    summary.edgesProcessed = edges.length;

    // Compute degrees
    //
    // Edge semantics in graph_edges:
    // - source_person_id: the person who follows (follower)
    // - target_person_id: the person being followed (followed)
    // - edge_type: 'friend' or 'friended' (both mean the same relationship, just discovered differently)
    //
    // For degree computation:
    // - out_degree: number of people this person follows (edges where person is source)
    // - in_degree: number of people who follow this person (edges where person is target)
    // - undirected_degree: total connections (out_degree + in_degree)
    //
    // Note: edge_type doesn't affect degree computation - it's just provenance metadata.
    // Both 'friend' and 'friended' edges represent the same "follows" relationship.

    const outDegrees = new Map<string, number>();  // person -> number of people they follow
    const inDegrees = new Map<string, number>();    // person -> number of followers they have
    const allPersons = new Set<string>();

    for (const edge of edges) {
      const source = edge.sourcePersonId;  // follower
      const target = edge.targetPersonId;  // followed

      allPersons.add(source);
      allPersons.add(target);

      // source follows target → source's out_degree increases
      outDegrees.set(source, (outDegrees.get(source) ?? 0) + 1);

      // target is followed by source → target's in_degree increases
      inDegrees.set(target, (inDegrees.get(target) ?? 0) + 1);
    }

    console.log(`Unique persons in graph: ${allPersons.size}`);

    // Verify degree computation
    let totalOutDeg = 0;
    let totalInDeg = 0;
    for (const deg of outDegrees.values()) totalOutDeg += deg;
    for (const deg of inDegrees.values()) totalInDeg += deg;
    console.log(`Total out_degree sum: ${totalOutDeg}, Total in_degree sum: ${totalInDeg}`);
    console.log(`Expected: both should equal ${edges.length}`);

    // Compute connected components (treating graph as undirected)
    console.log("Computing connected components...");
    const uf = new UnionFind();

    for (const edge of edges) {
      uf.union(edge.sourcePersonId, edge.targetPersonId);
    }

    const componentSizes = uf.getComponentSizes();
    const componentRoots = new Map<string, string>();
    for (const personId of allPersons) {
      const root = uf.find(personId);
      componentRoots.set(personId, root);
    }

    // Count unique components
    const uniqueComponents = new Set(componentRoots.values());
    summary.componentsFound = uniqueComponents.size;

    // Find largest component
    let maxSize = 0;
    for (const size of componentSizes.values()) {
      if (size > maxSize) maxSize = size;
    }
    summary.largestComponentSize = maxSize;

    console.log(`Found ${summary.componentsFound} components, largest: ${summary.largestComponentSize}`);

    // Clear existing features
    console.log("Clearing existing node features...");
    await db.delete(graphNodeFeatures);

    // Insert features in batches
    const BATCH_SIZE = 1000;
    const personIds = Array.from(allPersons);
    let computed = 0;

    for (let i = 0; i < personIds.length; i += BATCH_SIZE) {
      const batch = personIds.slice(i, i + BATCH_SIZE);
      const featuresToInsert = batch.map((personId) => {
        const outDeg = outDegrees.get(personId) ?? 0;
        const inDeg = inDegrees.get(personId) ?? 0;
        const undirectedDeg = outDeg + inDeg;
        const componentId = componentRoots.get(personId) ?? null;
        const componentSize = componentId ? (componentSizes.get(componentId) ?? 1) : null;

        return {
          personId,
          outDegree: outDeg,
          inDegree: inDeg,
          undirectedDegree: undirectedDeg,
          componentId,
          componentSize
        };
      });

      await db.insert(graphNodeFeatures).values(featuresToInsert);
      computed += batch.length;
      console.log(`Computed features for ${computed}/${personIds.length} persons`);
    }

    summary.personsProcessed = allPersons.size;
    summary.featuresComputed = computed;

    console.log(`Computed features for ${summary.featuresComputed} persons.`);

    return summary;
  } catch (error) {
    summary.status = "failed";
    summary.errors.push(error instanceof Error ? error.message : String(error));
    return summary;
  } finally {
    await ownedConnection.close();
  }
}

async function main() {
  const result = await computeNodeFeatures();
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
