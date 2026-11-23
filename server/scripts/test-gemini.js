import 'dotenv/config';
import {
  testGeminiConnection,
  extractConcepts,
  extractRelationships,
  generateLearningMap,
  generateSummary
} from '../src/services/gemini/index.js';
import { config } from '../src/config/env.js';

// Authentic university classroom lecture excerpt (Computer Science / Artificial Intelligence)
const SAMPLE_LECTURE_TRANSCRIPT = `
Good morning everyone. Today in CS 402, we are going to dive into the foundational architecture of Modern Neural Networks.
Let's begin with the concept of the Artificial Neuron, originally inspired by biological neurons through the early McCulloch-Pitts model and Frank Rosenblatt's Perceptron.
Now, the basic Perceptron takes multiple weighted inputs, computes a linear combination, and passes it through an activation function.
However, a single-layer perceptron has a fundamental limitation discovered by Minsky and Papert in 1969: it cannot solve linearly non-separable problems, specifically the XOR problem.
To overcome this critical bottleneck, the field developed the Multilayer Perceptron, or MLP. An MLP introduces one or more hidden layers between the input and output.
By adding non-linear activation functions like Sigmoid, Tanh, or ReLU, an MLP becomes a universal function approximator.
To train an MLP, we cannot use simple perceptron learning rules because we need to determine how hidden units contribute to the final error.
This is solved by the Backpropagation algorithm, formalized by Rumelhart, Hinton, and Williams in 1986.
Backpropagation utilizes the mathematical Chain Rule of calculus to compute the gradient of the loss function with respect to every weight in the network.
These gradients are then used by an optimization algorithm—specifically Gradient Descent or Stochastic Gradient Descent (SGD)—to iteratively update the weights and minimize the prediction error.
So remember this trajectory: the Perceptron's inability to solve XOR directly motivated the development of Multilayer Perceptrons, which in turn necessitated Backpropagation and Gradient Descent to enable multi-layer training.
`;

async function runGeminiVerification() {
  console.log('====================================================');
  console.log('🤖 LectureMind - Part 4 Google Gemini API Verification');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // TEST 1: Environment & API Key Configuration
    // ----------------------------------------------------
    console.log('[Test 1/6] Validating Gemini API Configuration...');
    if (!config.geminiApiKey || !config.geminiApiKey.trim()) {
      throw new Error('GEMINI_API_KEY is not defined in server/.env. Please configure it.');
    }
    const maskedKey = `${config.geminiApiKey.substring(0, 4)}...${config.geminiApiKey.substring(config.geminiApiKey.length - 4)}`;
    console.log(`✅ API Key present: ${maskedKey}`);
    console.log(`   Configured Model: ${config.geminiTextModel}`);

    // ----------------------------------------------------
    // TEST 2: Live Gemini API Connectivity
    // ----------------------------------------------------
    console.log('\n[Test 2/6] Testing Live Gemini API Connectivity...');
    const conn = await testGeminiConnection();
    if (!conn.connected) {
      throw new Error(`Gemini connection test failed: ${conn.error}`);
    }
    console.log(`✅ Successfully connected to Google Gemini API!`);
    console.log(`   Active Model: ${conn.model}`);
    console.log(`   Response Latency: ${conn.latencyMs}ms`);

    // ----------------------------------------------------
    // TEST 3: Grounded Concept Extraction
    // ----------------------------------------------------
    console.log('\n[Test 3/6] Testing Grounded Concept Extraction (transcript -> concepts)...');
    const concepts = await extractConcepts(SAMPLE_LECTURE_TRANSCRIPT, { maxConcepts: 6 });

    if (!Array.isArray(concepts) || concepts.length === 0) {
      throw new Error('Concept extraction returned empty array.');
    }

    // Verify schema adherence
    const validConcept = concepts.every(
      (c) => typeof c.name === 'string' && typeof c.description === 'string' && typeof c.importance === 'number'
    );
    if (!validConcept) {
      throw new Error('Concept extraction did not adhere to required schema fields.');
    }

    console.log(`✅ Extracted ${concepts.length} grounded concepts:`);
    concepts.forEach((c, idx) => {
      console.log(`   ${idx + 1}. [★${c.importance}] ${c.name} (${c.category})`);
      console.log(`      "${c.description.substring(0, 80)}..."`);
    });

    // ----------------------------------------------------
    // TEST 4: Grounded Relationship Identification
    // ----------------------------------------------------
    console.log('\n[Test 4/6] Testing Relationship Extraction (concepts + transcript -> relationships)...');
    const relationships = await extractRelationships(concepts, SAMPLE_LECTURE_TRANSCRIPT);

    if (!Array.isArray(relationships) || relationships.length === 0) {
      throw new Error('Relationship extraction returned empty array.');
    }

    const validRel = relationships.every(
      (r) => r.sourceConceptName && r.targetConceptName && r.relationshipType
    );
    if (!validRel) {
      throw new Error('Relationship extraction did not adhere to required schema.');
    }

    console.log(`✅ Identified ${relationships.length} conceptual relationships:`);
    relationships.forEach((r, idx) => {
      console.log(`   ${idx + 1}. "${r.sourceConceptName}" --[${r.relationshipType}]--> "${r.targetConceptName}"`);
      console.log(`      Explanation: ${r.description.substring(0, 90)}...`);
    });

    // ----------------------------------------------------
    // TEST 5: Learning Map Graph Synthesis
    // ----------------------------------------------------
    console.log('\n[Test 5/6] Testing Learning Map Graph Synthesis (concepts + relationships -> graph)...');
    const learningMap = await generateLearningMap(concepts, relationships);

    if (!learningMap.nodes || !learningMap.edges || learningMap.nodes.length === 0) {
      throw new Error('Learning map synthesis produced invalid graph structure.');
    }

    // Check node coordinate calculations
    const hasCoordinates = learningMap.nodes.every(
      (n) => n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'
    );
    if (!hasCoordinates) {
      throw new Error('Learning map nodes missing 2D layout coordinates.');
    }

    console.log(`✅ Learning map generated successfully:`);
    console.log(`   Nodes: ${learningMap.nodes.length} (with computed layout coordinates, categories, sizes)`);
    console.log(`   Edges: ${learningMap.edges.length} (with directional relationships & labels)`);
    console.log(`   Layout Config: ${JSON.stringify(learningMap.layoutConfig)}`);

    // ----------------------------------------------------
    // TEST 6: Grounded Lecture Summarization
    // ----------------------------------------------------
    console.log('\n[Test 6/6] Testing Lecture Summarization (transcript -> summary)...');
    const summary = await generateSummary(SAMPLE_LECTURE_TRANSCRIPT);

    if (!summary.title || !summary.executiveSummary || !Array.isArray(summary.keyTakeaways)) {
      throw new Error('Summary response missing required schema fields.');
    }

    console.log(`✅ Summary generated successfully:`);
    console.log(`   Title: "${summary.title}"`);
    console.log(`   Takeaways (${summary.keyTakeaways.length}):`);
    summary.keyTakeaways.slice(0, 3).forEach((t, i) => console.log(`      • ${t}`));
    console.log(`   Executive Summary Snippet: "${summary.executiveSummary.substring(0, 140)}..."`);

    console.log('\n🎉 ALL GEMINI API & SERVICE TESTS PASSED WITH 100% SUCCESS!\n');
  } catch (error) {
    console.error('\n❌ Gemini verification test failed:', error.message);
    process.exitCode = 1;
  }
}

runGeminiVerification();
