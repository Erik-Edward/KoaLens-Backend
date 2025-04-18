# Gemini thinking

The Gemini 2.5 series models use an internal "thinking process" during response generation. This process contributes to their improved reasoning capabilities and helps them use multi-step planning to solve complex tasks. This makes these models especially good at coding, advanced mathematics, data analysis, and other tasks that require planning or thinking.

[Try Gemini 2.5 Pro Preview in Google AI Studio](https://aistudio.google.com/prompts/new_chat?model=gemini-2.5-pro-preview-03-25)

This guide shows you how to work with Gemini's thinking capabilities using the Gemini API.

**Note:** 'gemini-2.5-pro-preview-03-25' is a billed model. You can continue to use 'gemini-2.5-pro-exp-03-25' on the free tier.

### Before you begin

Before calling the Gemini API, ensure you have [your SDK of choice](https://ai.google.dev/gemini-api/docs/downloads) installed, and a [Gemini API key](https://ai.google.dev/gemini-api/docs/api-key) configured and ready to use.

## Use thinking models

Models with thinking capabilities are available in [Google AI Studio](https://aistudio.google.com/prompts/new_chat?model=gemini-2.5-pro-exp-03-25) and through the Gemini API. Thinking is on by default in both the API and AI Studio because the 2.5 series models have the ability to automatically decide when and how much to think based on the prompt. For most use cases, it's beneficial for the user to leave thinking on. But if you want to to turn thinking off, you can do so by setting the thinkingBudget parameter to 0.

Note that a summarized version of the thinking process is available through both the API and Google AI Studio.

### Send a basic request

**JavaScript**

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const prompt = "Explain the concept of Occam's Razor and provide a simple, everyday example.";
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-04-17",
    contents: prompt,
  });
  
  console.log(response.text);
}

main();
```

### Set budget on thinking models

The thinkingBudget parameter (thinking_budget in Python) gives the model guidance on how many thinking tokens it can use for its thinking process. A greater number of tokens is typically associated with more detailed thinking, which is needed for solving more complex tasks. thinkingBudget must be an integer in the range 0 to 24576. Setting the thinking budget to 0 disables thinking. Budgets from 1 to 1024 tokens will be set to 1024.

**Note:** Depending on the prompt, the model might overflow or underflow the token budget.

**JavaScript**

```javascript
import { GoogleGenAI } from "@google/genai";

const prompt =
  "Explain the Occam's Razor concept and provide everyday examples of it";

const budget = 1024; // You can set this variable to any value between 0 and 24k

const ai = new GoogleGenAI({ apiKey: "GOOGLE_API_KEY" });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-04-17",
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingBudget: budget,
      },
    },
  });
  
  console.log(response.text);
}

main();
```

## Use tools with thinking models

Thinking models can use tools to perform actions beyond generating text. This allows them to interact with external systems, execute code, or access real-time information, incorporating the results into their reasoning and final response.

### Search Tool

The [Search tool](https://ai.google.dev/gemini-api/docs/grounding) allows the model to query external search engines to find up-to-date information or information beyond its training data. This is useful for questions about recent events or highly specific topics.

To configure the search tool, see [Configure the Search tool](https://ai.google.dev/gemini-api/docs/grounding#configure-search-tool).

> **Prompt:**
> 
> What were the major scientific breakthroughs announced last week?
> 
> **Response (using Search Tool):**
> 
> Based on recent search results, here are some highlights from the past week in science:
> 
> ...

### Code Execution

The [Code execution tool](https://ai.google.dev/gemini-api/docs/code-execution) enables the model to generate and run Python code to perform calculations, manipulate data, or solve problems that are best handled algorithmically. The model receives the code's output and can use it in its response.

To configure code execution, see [Enable code execution on the model](https://ai.google.dev/gemini-api/docs/code-execution#enable-on-model).

> **Prompt:**
> 
> What is the sum of the first 50 prime numbers?
> 
> Generate and run Python code for the calculation, and make sure you get all 50.
> 
> Provide the final sum clearly.
> 
> **Response (using Code Execution Tool):**
> 
> Okay, I can calculate that. I will generate Python code to find the first 50 prime numbers and sum them up.
> 
> ```python
> def is_prime(num):
>     if num < 2:
>         return False
>     for i in range(2, int(num**0.5) + 1):
>         if num % i == 0:
>             return False
>     return True
> 
> primes = []
> num = 2
> while len(primes) < 50:
>     if is_prime(num):
>         primes.append(num)
>     num += 1
> 
> total_sum = sum(primes)
> print(total_sum)
> ```
> 
> Running the code...
> 
> Code Execution Result:
> 
> Outcome: OK
> 
> Output:
> 
> 5117
> 
> Use code with caution.
> 
> The sum of the first 50 prime numbers is 5117.

### Thinking with structured output

With [structured output](https://ai.google.dev/gemini-api/docs/structured-output), you can constrain Gemini to respond with JSON, a structured output format suitable for automated processing. This is particularly useful for integrating the model's output into applications.

You can specify the format directly in the prompt or [supply a schema through model configuration](https://ai.google.dev/gemini-api/docs/structured-output#supply-schema-in-config).

> **Prompt:**
> 
> Provide a list of 3 famous physicists and their key contributions
> 
> in JSON format.
> 
> Use this JSON schema:
> 
> Physicist = {'name': str, 'contribution': str, 'era': str}
> 
> Return: list[Physicist]
> 
> **Response (instructed for JSON):**
> 
> ```json
> [
>   {
>     "name": "Albert Einstein",
>     "contribution": "Theory of Relativity (Special and General)",
>     "era": "Early 20th Century"
>   },
>   {
>     "name": "Isaac Newton",
>     "contribution": "Laws of Motion and Universal Gravitation",
>     "era": "Late 17th / Early 18th Century"
>   },
>   {
>     "name": "Marie Curie",
>     "contribution": "Pioneering research on radioactivity",
>     "era": "Late 19th / Early 20th Century"
>   }
> ]
> ```

## Prompting techniques for thinking models

Effective prompting is crucial for maximizing the benefits of the Gemini thinking models. This section outlines some prompting practices for thinking models.

### Getting started

Begin with general instructions that describe the desired outcome. Start with a simple prompt and observe the model's initial thoughts on how to tackle the challenge.

> **Prompt:**
> 
> Describe the most unusual or striking architectural feature you've ever seen in a building or structure.
> 
> **Response:**
> 
> <...>
> 
> The most unusual architectural feature that has truly stayed with me is the "floating roof" of the
> 
> Heydar Aliyev Center in Baku, Azerbaijan, designed by Zaha Hadid Architects.
> 
> Visually, it's breathtaking. Imagine a vast, undulating landscape of pure white, seemingly draped
> 
> over the building. It's not just a roof in the traditional sense; it's an extension of the ground,
> 
> flowing seamlessly upwards and over the building's various spaces before curving back down to meet
> 
> the earth again. There are no sharp angles, no rigid lines. Instead, everything is fluid, organic,
> 
> and continuous. It resembles a giant, pristine white wave frozen in motion, or perhaps a sand dune
> 
> sculpted by an unseen wind.
> 
> <...>
> 
> (gemini-2.5-pro-exp-03-25)

### Provide Step-by-Step Instructions

If the initial attempt does not yield the desired result, refine your prompt by providing more explicit step-by-step instructions to guide Gemini through the problem-solving process for a more focused approach. This allows you steer the model's initial understanding of the task with explicit suggestions and guidance.

> **Prompt:**
> 
> Now imagine that architectural feature is not just for looks, but has a specific function or
> 
> purpose related to the building's environment or the people who use it. Explain what that
> 
> function could be and how it enhances the building's overall design and usability.
> 
> **Response:**
> 
> <...>
> 
> Let's imagine that the "floating roof" of the Heydar Aliyev Center is not purely aesthetic but
> 
> serves a crucial environmental and user-centric function: it's designed as a sophisticated climate
> 
> moderator and natural ventilation system for the Baku environment.
> 
> Here's how this function would work and enhance the building:
> 
> Function: Passive Climate Control and Natural Ventilation System
> 
> Shading and Solar Heat Mitigation: The undulating curves of the white GFRC roof are strategically
> 
> shaped and oriented to provide optimal shading throughout the day, year-round. Baku experiences
> 
> intense sun, especially during the summer. The overhanging curves, acting like giant brise-soleils,
> 
> would block direct sunlight from hitting the building's glass facade, significantly reducing solar
> 
> heat gain. The varying heights and depths of the curves would create dynamic shade patterns, ensuring
> 
> that different parts of the building are shaded at different times of the day, optimizing comfort
> 
> and reducing the need for excessive air conditioning. The white color of the GFRC further enhances
> 
> this by reflecting a large portion of the solar radiation.
> 
> <...>
> 
> (gemini-2.5-pro-exp-03-25)

### Multishot Prompting with Thinking

Multishot prompting in conjunction with thinking can further enhance Gemini's understanding and improve the accuracy of its responses. Provide several examples of input-output pairs, demonstrating the desired behavior and output format in your prompt.

> **Prompt:**
> 
> Example 1:
> 
> User: What is the tallest mountain in the world?
> 
> Assistant: Mount Everest
> 
> Example 2:
> 
> User: What is the largest ocean?
> 
> Assistant: Pacific Ocean
> 
> User: What is the longest river in the world?
> 
> Assistant:
> 
> **Response:**
> 
> Amazon River
> 
> (gemini-2.5-pro-exp-03-25)

### Defining Output and Behavior

When building an application where users will interact directly with the model, you may want to provide guidance for how Gemini's output and responses will sound and be formatted.

#### System Instructions

System instructions are a set of instructions that the model processes before it processes prompts. They are recalled each time the model is prompted and tell the model how you want it to behave and respond. For example, you can include things like the role or persona, contextual information, and formatting instructions.

> **Prompt:**
> 
> System Instruction: You are a helpful and concise coding tutor. Always provide code examples and explain them briefly.
> 
> User Prompt: Explain what is a closure in Javascript and give an example.
> 
> **Response:**
> 
> ```javascript
> function outerFunction(outerVar) {
>   function innerFunction(innerVar) {
>     console.log(outerVar); // Accessing outerVar from outerFunction's scope
>     console.log(innerVar);
>   }
>   return innerFunction;
> }
> 
> const closureExample = outerFunction('I am from outer');
> closureExample('I am from inner');
> ```
> 
> Explanation:
> 
> A closure is created when a function (innerFunction in this example) is defined inside another function
> 
> (outerFunction) and the inner function remembers and has access to the variables from the outer
> 
> function's scope, even after the outer function has finished executing.
> 
> In the example:
> 
> outerFunction is called with 'I am from outer' and returns innerFunction.
> 
> closureExample now holds a reference to innerFunction.
> 
> When closureExample('I am from inner') is called, innerFunction executes.
> 
> Even though outerFunction has already finished, innerFunction can still access and use outerVar
> 
> (which is 'I am from outer') because of the closure.
> 
> In essence, the innerFunction "closes over" the variables of its outer function's scope, creating
> 
> a closure.
> 
> (gemini-2.5-pro-exp-03-25)

#### Verification and Reflection

Include specific verification steps in either the System Instructions or your prompts directly. For example, ask Gemini to verify its sources, review its reasoning, identify potential errors, and check its final answer.

> **Prompt:**
> 
> Verify the following statement and provide your sources: The capital of Brazil is Rio de Janeiro.
> 
> **Response:**
> 
> The statement "The capital of Brazil is Rio de Janeiro" is incorrect.
> 
> The current capital of Brazil is Brasília.
> 
> Rio de Janeiro was the capital of Brazil for a significant period, from 1763 to 1960. However, the
> 
> capital was moved to Brasília in 1960 as part of a plan to develop the country's interior and create
> 
> a more centrally located capital.
> 
> Verification and Sources:
> 
> You can easily verify this information from numerous reliable sources:
> 
> Encyclopedias:
> 
> Britannica: Searching for "Brazil" on Britannica will clearly state Brasília as the capital.
> 
> https://www.britannica.com/place/Brazil (Look for the "Capital" information in the introductory summary or "Geography" section)
> 
> Wikipedia: The Wikipedia article for "Brazil" also states Brasília as the capital.
> 
> https://en.wikipedia.org/wiki/Brazil (Look in the infobox or introductory section)
> 
> Government and Official Sources:
> 
> CIA World Factbook: This is a highly reliable source for country information. Searching for "Brazil"
> 
> will list Brasília as the capital.
> 
> https://www.cia.gov/the-world-factbook/countries/brazil/ (Look under "Government" > "Capital")
> 
> Official Website of the Brazilian Government (if accessible and in English): While navigating official
> 
> government websites can sometimes be complex, they would definitively list Brasília as the capital.
> 
> Geographic Resources:
> 
> National Geographic: Their website and publications will confirm Brasília as the capital of Brazil.
> 
> Atlases and Geography Textbooks: Any modern atlas or geography textbook will list Brasília as the capital.
> 
> Why the confusion?
> 
> The confusion might arise because:
> 
> Rio de Janeiro is a very famous Brazilian city: It's a major tourist destination, known for its
> 
> beaches, Carnival, and iconic landmarks like Christ the Redeemer. Its past status as capital adds
> 
> to its historical significance and public recognition.
> 
> Historical context: Rio de Janeiro was the capital for a long time. People who learned about Brazil
> 
> in the past might remember it as the capital.
> 
> In conclusion, the statement is false. The capital of Brazil is Brasília, not Rio de Janeiro. Rio
> 
> de Janeiro was the former capital but is no longer the current capital.
> 
> You can confidently use the sources listed above to verify this information.
> 
> (gemini-2.5-pro-exp-03-25)

### Debugging and Steering

Google AI Studio provides developers access to the model's thoughts in the UI. This is helpful as a developer reviewing your prompt when debugging:

#### Analyze the Thought Process

Carefully review Gemini's thought process to identify any areas where it may have gone astray. This analysis can provide valuable clues for refining your prompts and getting your expected response consistently in your application.

*Example Scenario: If Gemini's thought process shows it misunderstood a step in a complex instruction, you can refine the prompt to clarify that specific step.*

> **Prompt:**
> 
> Step 1: Summarize the following article about quantum physics.
> 
> Step 2: Translate the summary into Spanish.
> 
> Step 3: Extract the key entities from the Spanish summary.
> 
> Article: ... [Article Text] ...
> 
> **Gemini's Thought Process Analysis (Example):**
> 
> The user wants me to process an article about Google's new quantum chip called Willow in three steps:
> 
> Step 1: Summarize the article.
> 
> Step 2: Translate the summary into Spanish.
> 
> Step 3: Extract the key entities from the Spanish summary.
> 
> Let's break down each step.
> 
> Step 1: Summarize the article.
> 
> I need to read the article and identify the main points. The article is about Google's new quantum
> 
> chip, Willow, and its achievements. The key achievements are:
> 
> Exponential error reduction as qubits scale up.
> 
> Outperforming supercomputers in a benchmark computation (RCS).
> 
> Willow is a step towards commercially relevant quantum computing.
> 
> It's the first system below threshold for quantum error correction.
> 
> It achieved a benchmark computation in under 5 minutes that would take a supercomputer 10 septillion years.
> 
> It was fabricated in a new facility.
> 
> It has state-of-the-art performance and high quality qubits.
> 
> Google is looking towards real-world applications with Willow.
> 
> Quantum computing will benefit AI.
> 
> I will synthesize these points into a concise summary.
> 
> Step 2: Translate the summary into Spanish.
> 
> Once I have the summary in English, I will translate it into Spanish. I need to ensure the translation
> 
> is accurate and natural-sounding in Spanish.
> 
> Step 3: Extract the key entities from the Spanish summary.
> 
> After translating the summary, I will identify and extract the key entities. Key entities are typically
> 
> nouns or noun phrases that represent important objects, concepts, or actors. In this context, they
> 
> will likely include:
> 
> Names of chips (Willow, Sycamore)
> 
> Companies/Organizations (Google Quantum AI, Google Research)
> 
> Technologies (quantum chip, quantum computer, qubits, quantum error correction, superconducting
> 
> quantum system, classical computers, supercomputers, AI)
> 
> Benchmarks (random circuit sampling, RCS)
> 
> People (Julian Kelly, Peter Shor, David Deutsch, Sergio Boixo, Hartmut Neven, John Preskill)
> 
> Concepts (exponential error reduction, below threshold, beyond breakeven, state-of-the-art performance,
> 
> commercially relevant applications, quantum mechanics, multiverse, T1 times, system benchmarks,
> 
> algorithmic benchmarks)
> 
> I will need to carefully review the Spanish summary to identify these entities and list them out.

#### Provide Corrective Feedback

If you observe errors or inconsistencies in Gemini's reasoning, provide corrective feedback in your prompt and/or System Instructions to anticipate where the model's response may deviate from your desired outcome.

> **Prompt:**
> 
> You are an expert in botany. When asked to identify a plant, focus on leaf shape, flower structure, and stem characteristics.
> 
> Identify this plant based on these characteristics: ... [Plant Characteristics Description] ...
> 
> Previous incorrect response focused on habitat only. Please disregard habitat and focus on morphology.
> 
> Refined Prompt (if needed based on thought process):
> 
> Previous incorrect response focused on habitat only. Please disregard habitat and focus on morphology.
> 
> **Response:**
> 
> Tabebuia vellosoi
> 
> (gemini-2.5-pro-exp-03-25)

### Making the Best of Long Outputs and Longform Thinking

Thinking generates "thoughts" as part of the Token Output that showcases Gemini's detailed reasoning. To make the most of these outputs:

#### Review the Reasoning

Pay close attention to Gemini's reasoning process (available in the Google AI Studio UI), how it broke down the task and the choices it made for your output. This can help you understand how it arrived at its conclusion.

#### Provide Guidance in Reasoning

If your desired output is to be particularly lengthy, you may want to provide more guidance in your prompt to constrain the amount of thinking needed to accomplish the task presented in the prompt. This allows you to reserve more of the Token Output for your response.

*Example: For a detailed report, you might specify sections and sub-sections in your prompt to guide Gemini's thinking and structure the output efficiently.*

> **Prompt:**
> 
> Generate a detailed report on the impact of climate change on coastal ecosystems.
> 
> Report Structure:
> 
> Introduction
> 
> Rising Sea Levels
> 
> 2.1. Impact on Mangroves
> 
> 2.2. Impact on Coral Reefs
> 
> Ocean Acidification
> 
> 3.1. Impact on Shellfish
> 
> 3.2. Impact on Plankton
> 
> Extreme Weather Events
> 
> 4.1. Increased Storm Intensity
> 
> 4.2. Coastal Erosion
> 
> Conclusion
> 
> Provide detailed analysis within each section.
> 
> **Response:**
> 
> <...>
> 
> Climate Change Impact on Coastal Ecosystems: A Detailed Report
> 
> 1\. Introduction
> 
> Coastal ecosystems, the dynamic interface between land and sea, are among the most productive and
> 
> biodiverse environments on Earth. They provide crucial ecosystem services, including coastal protection,
> 
> fisheries, carbon sequestration, and support for a vast array of species. However, these vital
> 
> ecosystems are increasingly threatened by the multifaceted impacts of climate change. Driven by
> 
> anthropogenic greenhouse gas emissions, climate change is manifesting in several interconnected ways
> 
> that are profoundly altering the physical and chemical conditions of coastal environments. This report
> 
> will delve into the key impacts of climate change on coastal ecosystems, focusing on rising sea levels,
> 
> ocean acidification, and extreme weather events, and their specific consequences for critical habitats
> 
> like mangroves and coral reefs, and key organisms like shellfish and plankton. Understanding these
> 
> impacts is crucial for developing effective conservation and management strategies to mitigate the
> 
> damage and enhance the resilience of these invaluable ecosystems.
> 
> 2\. Rising Sea Levels
> 
> Rising sea levels are a direct and significant consequence of global warming, driven by thermal
> 
> expansion of seawater and the melting of land ice (glaciers and ice sheets). This phenomenon poses a
> 
> direct threat to low-lying coastal ecosystems by inundating habitats, altering salinity regimes, and
> 
> increasing erosion rates. The rate of sea level rise is accelerating, and projections for the 21st
> 
> century indicate a continued upward trend, with potentially devastating consequences for coastal
> 
> environments.
> 
> 2.1. Impact on Mangroves
> 
> Mangrove forests are unique coastal ecosystems found in tropical and subtropical intertidal zones.
> 
> They provide numerous benefits, including coastal protection against storms, nursery grounds for
> 
> fish and invertebrates, and significant carbon sequestration...
> 
> <...>
> 
> (gemini-2.5-pro-exp-03-25)

## More things to try

- **Easy Tasks (Thinking could be OFF):** For straightforward requests, complex reasoning isn't required such as straightforward fact retrieval or classification, thinking is not required. Examples include:

  - "Where was DeepMind founded?"

  - "Is this email asking for a meeting or just providing information?"

- **Medium Tasks (Default/Some Thinking):** Many common requests benefit from a degree of step-by-step processing or deeper understanding. Gemini can flexibly use thinking capability for tasks like:

  - Analogize photosynthesis and growing up.

  - Compare and contrast electric cars and hybrid cars.

- **Hard Tasks (Maximum Thinking Capability):** For truly complex challenges, the AI needs to engage its full reasoning and planning capabilities, often involving many internal steps before providing an answer. Examples include:

  - Solve problem 1 in AIME 2025: Find the sum of all integer bases b > 9 for which 17ₕ is a divisor of 97ₕ.

  - Write Python code for a web application that visualizes real-time stock market data, including user authentication. Make it as efficient as possible.
