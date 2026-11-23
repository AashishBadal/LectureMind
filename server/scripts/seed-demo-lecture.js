import { prisma } from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';

async function seed() {
  const email = 'elena.rostova@lecturemind.internal';
  const password = 'ElenaSecure2026!';
  const passwordHash = await bcrypt.hash(password, 10);

  // Upsert user
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name: 'Dr. Elena Rostova',
      email,
      passwordHash
    },
    update: {
      passwordHash
    }
  });

  console.log(`User ready: ${user.email} (${user.id})`);

  // Create or update demo lecture
  const lecture = await prisma.lecture.create({
    data: {
      userId: user.id,
      title: 'CS 402: Deep Feedforward Networks & Backpropagation',
      status: 'ANALYZED',
      duration: 320,
      originalFileName: 'cs402_lecture_deep_networks.mp3'
    }
  });

  const transcriptText = `
Good morning everyone. Today in CS 402, we are discussing the architecture of Deep Feedforward Networks, specifically focusing on Backpropagation and Gradient Descent.

First, let us understand the Perceptron. The single-layer perceptron was introduced in the late 1950s by Frank Rosenblatt. It takes weighted inputs, sums them, and passes them through an activation step function. However, as Minsky and Papert proved in 1969, a single perceptron cannot solve non-linearly separable problems, most famously the XOR problem.

To overcome this limitation, we use the Multilayer Perceptron, or MLP. An MLP introduces one or more hidden layers between the input and output. The universal approximation theorem guarantees that a feedforward network with a single hidden layer and non-linear activation functions can approximate any continuous function on compact subsets of R^n.

Now, how do we train these hidden layers? We use Backpropagation. Backpropagation is an efficient algorithm for computing the gradient of the loss function with respect to every weight in the network. It applies the chain rule of calculus repeatedly backwards from the final output layer to the earliest input layer.

Finally, once backpropagation gives us these partial derivatives or gradients, we update the weights using Gradient Descent. Specifically, Stochastic Gradient Descent, or SGD, takes mini-batches of training samples rather than the entire dataset, balancing computational speed and gradient variance.
`;

  await prisma.transcript.create({
    data: {
      lectureId: lecture.id,
      content: transcriptText.trim(),
      segments: [
        { start: 0, end: 45, speaker: 'Prof. Rostova', text: 'Today in CS 402, we are discussing Deep Feedforward Networks, specifically focusing on Backpropagation and Gradient Descent.' },
        { start: 45, end: 120, speaker: 'Prof. Rostova', text: 'The single-layer Perceptron was introduced by Frank Rosenblatt, but cannot solve non-linear problems like the XOR problem.' },
        { start: 120, end: 210, speaker: 'Prof. Rostova', text: 'To overcome this, Multilayer Perceptron (MLP) adds hidden layers, supported by the Universal Approximation Theorem.' },
        { start: 210, end: 320, speaker: 'Prof. Rostova', text: 'We train hidden layers using Backpropagation via the chain rule, and update weights iteratively with Stochastic Gradient Descent.' }
      ]
    }
  });

  await prisma.summary.create({
    data: {
      lectureId: lecture.id,
      content: 'This lecture delivers an academic foundation in Deep Feedforward Networks, detailing the historical progression from the single-layer Perceptron to the Multilayer Perceptron (MLP). The lecture addresses the fundamental limitation exposed by Minsky and Papert regarding the XOR problem, demonstrating how hidden layers and non-linear activations provide universal function approximation. Furthermore, the operational mechanics of Backpropagation are presented as an application of the calculus chain rule, enabling efficient gradient calculation for Stochastic Gradient Descent parameter optimization.'
    }
  });

  const conceptsData = [
    { name: 'Perceptron', description: 'Single-layer linear classifier introduced by Frank Rosenblatt that computes weighted sums of inputs.', importance: 2 },
    { name: 'XOR Problem', description: 'Non-linearly separable logical problem demonstrating the expressive limitations of single-layer perceptrons.', importance: 2 },
    { name: 'Multilayer Perceptron', description: 'Feedforward network with hidden layers capable of non-linear decision boundaries.', importance: 3 },
    { name: 'Universal Approximation Theorem', description: 'Mathematical theorem stating a feedforward network with one hidden layer can approximate continuous functions.', importance: 3 },
    { name: 'Backpropagation', description: 'Algorithm calculating the loss gradient with respect to network weights via reverse application of the calculus chain rule.', importance: 3 },
    { name: 'Stochastic Gradient Descent', description: 'Optimization algorithm iteratively updating weights using mini-batch gradient estimates to minimize empirical loss.', importance: 3 }
  ];

  for (const c of conceptsData) {
    await prisma.concept.create({
      data: {
        lectureId: lecture.id,
        name: c.name,
        description: c.description,
        importance: c.importance
      }
    });
  }

  console.log(`Demo lecture successfully created! ID: ${lecture.id}`);
  await prisma.$disconnect();
}

seed();
