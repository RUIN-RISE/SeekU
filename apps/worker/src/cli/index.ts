import { 
  createDatabaseConnection, 
  persons, 
  searchDocuments, 
  evidenceItems, 
  and, 
  eq, 
  inArray,
  ProfileCacheRepository,
  Person,
  EvidenceItem
} from "@seeku/db";
import { SiliconFlowProvider } from "@seeku/llm";
import { QueryPlanner, HybridRetriever, Reranker } from "@seeku/search";
import { ChatInterface } from "./chat.js";
import { TerminalUI } from "./tui.js";
import { ScoredCandidate, MultiDimensionProfile } from "./types.js";
import { HybridScoringEngine } from "./scorer.js";
import { ProfileGenerator } from "./profile-generator.js";
import { TerminalRenderer } from "./renderer.js";
import chalk from "chalk";

export async function runInteractiveSearch() {
  const { db, close } = createDatabaseConnection();
  const chat = new ChatInterface();
  const tui = new TerminalUI();
  const scorer = new HybridScoringEngine();
  const generator = new ProfileGenerator();
  const renderer = new TerminalRenderer();
  const cacheRepo = new ProfileCacheRepository(db);
  const provider = SiliconFlowProvider.fromEnv();
  
  try {
    console.log(chalk.bold.blue("\n✨ Welcome to Seeku Interactive Search"));
    console.log(chalk.dim("Type your requirements naturally. Press Ctrl+C to exit.\n"));

    const initialInput = await chat.askFollowUp("skills");
    if (!initialInput) return;

    tui.displayInitialSearch(initialInput);
    
    const conditions = await chat.refineConditions(initialInput);
    tui.displayRefinedConditions(conditions);

    const planner = new QueryPlanner({ provider });
    const retriever = new HybridRetriever({ db, provider, limit: 50 });
    const reranker = new Reranker();

    const effectiveQuery = [
      ...conditions.skills,
      ...conditions.locations,
      conditions.experience ?? "",
      conditions.role ?? ""
    ].filter(s => s && s.trim().length > 0).join(" ");

    const intent = await planner.parse(effectiveQuery);
    const queryEmbedding = await provider.embed(intent.rawQuery);
    const retrieved = await retriever.retrieve(intent, { embedding: queryEmbedding.embedding });

    if (retrieved.length === 0) {
      console.log(chalk.yellow("\nNo candidates found for these criteria."));
      return;
    }

    const personIds = retrieved.map(r => r.personId);
    const [documents, evidence, people] = await Promise.all([
      db.select().from(searchDocuments).where(inArray(searchDocuments.personId, personIds)),
      db.select().from(evidenceItems).where(inArray(evidenceItems.personId, personIds)),
      db.select().from(persons).where(and(eq(persons.searchStatus, "active"), inArray(persons.id, personIds)))
    ]);

    const documentMap = new Map(documents.map(d => [d.personId, d]));
    const evidenceMap = new Map<string, EvidenceItem[]>();
    for (const item of evidence) {
      const arr = evidenceMap.get(item.personId) ?? [];
      arr.push(item as EvidenceItem);
      evidenceMap.set(item.personId, arr);
    }
    const personMap = new Map(people.map(p => [p.id, p as Person]));

    const reranked = reranker.rerank(retrieved, intent, documentMap, evidenceMap);
    const candidates: ScoredCandidate[] = reranked.slice(0, conditions.limit).map(result => {
      const p = personMap.get(result.personId);
      return {
        personId: result.personId,
        name: p?.primaryName ?? "Unknown",
        headline: p?.primaryHeadline ?? null,
        location: p?.primaryLocation ?? null,
        company: null,
        experienceYears: null,
        matchScore: result.finalScore
      };
    });

    let done = false;
    while (!done) {
      const selected = await tui.selectCandidate(candidates);
      if (!selected) {
        done = true;
      } else {
        // Wave 3: Detailed Insight Core
        console.log(chalk.blue(`\n🔍 Loading deep insight for ${selected.name}...`));
        
        let profile: MultiDimensionProfile | null = await cacheRepo.getProfile(selected.personId);
        const person = personMap.get(selected.personId)!;
        const personEvidence = evidenceMap.get(selected.personId) || [];

        if (!profile) {
          console.log(chalk.dim("   (Cache miss, calculating hybrid scores...)"));
          const rules = scorer.scoreByRules(person, personEvidence, conditions);
          const llm = await scorer.scoreByLLM(person, personEvidence);
          profile = scorer.aggregate(rules, llm);
          
          console.log(chalk.dim("   (Generating summary & highlights...)"));
          profile = await generator.generate(person, personEvidence, profile);
          
          await cacheRepo.setProfile(selected.personId, profile, profile.overallScore);
        } else {
          console.log(chalk.dim("   (Cache hit!)"));
        }

        console.log(renderer.renderProfile(person, personEvidence, profile));
        
        console.log(chalk.dim("Press Enter to return to list..."));
        await new Promise(resolve => process.stdin.once("data", resolve));
      }
    }

  } catch (error) {
    console.error(chalk.red("\n❌ Error during interactive search:"), error);
  } finally {
    await close();
  }
}
