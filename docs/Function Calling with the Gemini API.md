**Function Calling with the Gemini API**

Function calling lets you connect models to external tools and APIs. Instead of generating text responses, the model understands when to call specific functions and provides the necessary parameters to execute real-world actions. This allows the model to act as a bridge between natural language and real-world actions and data. Function calling has 3 primary use cases:

* **Augment Knowledge:** Access information from external sources like databases, APIs, and knowledge bases.  
* **Extend Capabilities:** Use external tools to perform computations and extend the limitations of the model, such as using a calculator or creating charts.  
* **Take Actions:** Interact with external systems using APIs, such as scheduling appointments, creating invoices, sending emails, or controlling smart home devices

## Create Chart

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
import { GoogleGenAI, Type } from '@google/genai';

// Configure the client  
const ai \= new GoogleGenAI({ apiKey: process.env.GEMINI\_API\_KEY });

// Define the function declaration for the model  
const createChartFunctionDeclaration \= {  
  name: 'create\_bar\_chart',  
  description: 'Creates a bar chart given a title, labels, and corresponding values.',  
  parameters: {  
    type: Type.OBJECT,  
    properties: {  
      title: {  
        type: Type.STRING,  
        description: 'The title for the chart.',  
      },  
      labels: {  
        type: Type.ARRAY,  
        items: { type: Type.STRING },  
        description: 'List of labels for the data points (e.g., \["Q1", "Q2", "Q3"\]).',  
      },  
      values: {  
        type: Type.ARRAY,  
        items: { type: Type.NUMBER },  
        description: 'List of numerical values corresponding to the labels (e.g., \[50000, 75000, 60000\]).',  
      },  
    },  
    required: \['title', 'labels', 'values'\],  
  },  
};

// Send request with function declarations  
const response \= await ai.models.generateContent({  
  model: 'gemini-2.0-flash',  
  contents: "Create a bar chart titled 'Quarterly Sales' with data: Q1: 50000, Q2: 75000, Q3: 60000.",  
  config: {  
    tools: \[{  
      functionDeclarations: \[createChartFunctionDeclaration\]  
    }\],  
  },  
});

// Check for function calls in the response  
if (response.functionCalls && response.functionCalls.length \> 0\) {  
  const functionCall \= response.functionCalls\[0\]; // Assuming one function call  
  console.log(\`Function to call: ${functionCall.name}\`);  
  console.log(\`Arguments: ${JSON.stringify(functionCall.args)}\`);  
  // In a real app, you would call your actual function here:  
  // const result \= await createBarChart(functionCall.args);  
} else {  
  console.log("No function call found in the response.");  
  console.log(response.text);  
}

## **How Function Calling Works**

Function calling involves a structured interaction between your application, the model, and external functions. Here's a breakdown of the process:

1. **Define Function Declaration:** Define the function declaration in your application code. Function Declarations describe the function's name, parameters, and purpose to the model.  
2. **Call LLM with function declarations:** Send user prompt along with the function declaration(s) to the model. It analyzes the request and determines if a function call would be helpful. If so, it responds with a structured JSON object.  
3. **Execute Function Code (Your Responsibility):** The Model *does not* execute the function itself. It's your application's responsibility to process the response and check for Function Call, if  
   * **Yes**: Extract the name and args of the function and execute the corresponding function in your application.  
   * **No:** The model has provided a direct text response to the prompt (this flow is less emphasized in the example but is a possible outcome).  
4. **Create User friendly response:** If a function was executed, capture the result and send it back to the model in a subsequent turn of the conversation. It will use the result to generate a final, user-friendly response that incorporates the information from the function call.

This process can be repeated over multiple turns, allowing for complex interactions and workflows. The model also supports calling multiple functions in a single turn ([parallel function calling](https://ai.google.dev/gemini-api/docs/function-calling#parallel_function_calling)) and in sequence ([compositional function calling](https://ai.google.dev/gemini-api/docs/function-calling#compositional_function_calling)).

### **Step 1: Define Function Declaration**

Define a function and its declaration within your application code that allows users to set light values and make an API request. This function could call external services or APIs.

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
import { Type } from '@google/genai';

// Define a function that the model can call to control smart lights  
const setLightValuesFunctionDeclaration \= {  
  name: 'set\_light\_values',  
  description: 'Sets the brightness and color temperature of a light.',  
  parameters: {  
    type: Type.OBJECT,  
    properties: {  
      brightness: {  
        type: Type.NUMBER,  
        description: 'Light level from 0 to 100\. Zero is off and 100 is full brightness',  
      },  
      color\_temp: {  
        type: Type.STRING,  
        enum: \['daylight', 'cool', 'warm'\],  
        description: 'Color temperature of the light fixture, which can be \`daylight\`, \`cool\` or \`warm\`.',  
      },  
    },  
    required: \['brightness', 'color\_temp'\],  
  },  
};

/\*\*  
\* Set the brightness and color temperature of a room light. (mock API)  
\* @param {number} brightness \- Light level from 0 to 100\. Zero is off and 100 is full brightness  
\* @param {string} color\_temp \- Color temperature of the light fixture, which can be \`daylight\`, \`cool\` or \`warm\`.  
\* @return {Object} A dictionary containing the set brightness and color temperature.  
\*/  
function setLightValues(brightness, color\_temp) {  
  return {  
    brightness: brightness,  
    colorTemperature: color\_temp  
  };  
}

### **Step 2: Call the model with function declarations**

Once you have defined your function declarations, you can prompt the model to use the function. It analyzes the prompt and function declarations and decides to respond directly or to call a function. If a function is called the response object will contain a function call suggestion.

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
import { GoogleGenAI } from '@google/genai';

// Generation Config with Function Declaration  
const config \= {  
  tools: \[{  
    functionDeclarations: \[setLightValuesFunctionDeclaration\]  
  }\]  
};

// Configure the client  
const ai \= new GoogleGenAI({ apiKey: process.env.GEMINI\_API\_KEY });

// Define user prompt  
const contents \= \[  
  {  
    role: 'user',  
    parts: \[{ text: 'Turn the lights down to a romantic level' }\]  
  }  
\];

// Send request with function declarations  
const response \= await ai.models.generateContent({  
  model: 'gemini-2.0-flash',  
  contents: contents,  
  config: config  
});

console.log(response.functionCalls\[0\]); 

The model then returns a `functionCall` object in an OpenAPI compatible schema specifying how to call one or more of the declared functions in order to respond to the user's question.

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
{  
  name: 'set\_light\_values',  
  args: { brightness: 25, color\_temp: 'warm' }  
}

### **Step 3: Execute set\_light\_values function code**

Extract the function call details from the model's response, parse the arguments , and execute the `set_light_values` function in our code.

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
// Extract tool call details  
const tool\_call \= response.functionCalls\[0\]

let result;  
if (tool\_call.name \=== 'set\_light\_values') {  
  result \= setLightValues(tool\_call.args.brightness, tool\_call.args.color\_temp);  
  console.log(\`Function execution result: ${JSON.stringify(result)}\`);  
}

### **Step 4: Create User friendly response with function result and call the model again**

Finally, send the result of the function execution back to the model so it can incorporate this information into its final response to the user.

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
// Create a function response part  
const function\_response\_part \= {  
  name: tool\_call.name,  
  response: { result }  
}

// Append function call and result of the function execution to contents  
contents.push({ role: 'model', parts: \[{ functionCall: tool\_call }\] });  
contents.push({ role: 'user', parts: \[{ functionResponse: function\_response\_part }\] });

// Get the final response from the model  
const final\_response \= await ai.models.generateContent({  
  model: 'gemini-2.0-flash',  
  contents: contents,  
  config: config  
});

console.log(final\_response.text);

This completes the function calling flow. The Model successfully used the `set_light_values` function to perform the request action of the user.

## **Function declarations**

When you implement function calling in a prompt, you create a `tools` object, which contains one or more *`function declarations`*. You define functions using JSON, specifically with a [select subset](https://ai.google.dev/api/caching#Schema) of the [OpenAPI schema](https://spec.openapis.org/oas/v3.0.3#schemawr) format. A single function declaration can include the following parameters:

* `name` (string): A unique name for the function (`get_weather_forecast`, `send_email`). Use descriptive names without spaces or special characters (use underscores or camelCase).  
* `description` (string): A clear and detailed explanation of the function's purpose and capabilities. This is crucial for the model to understand when to use the function. Be specific and provide examples if helpful ("Finds theaters based on location and optionally movie title which is currently playing in theaters.").  
* `parameters` (object): Defines the input parameters the function expects.  
  * `type` (string): Specifies the overall data type, such as `object`.  
  * `properties` (object): Lists individual parameters, each with:  
    * `type` (string): The data type of the parameter, such as `string`, `integer`, `boolean, array`.  
    * `description` (string): A description of the parameter's purpose and format. Provide examples and constraints ("The city and state, e.g., 'San Francisco, CA' or a zip code e.g., '95616'.").  
    * `enum` (array, optional): If the parameter values are from a fixed set, use "enum" to list the allowed values instead of just describing them in the description. This improves accuracy ("enum": \["daylight", "cool", "warm"\]).  
  * `required` (array): An array of strings listing the parameter names that are mandatory for the function to operate.

## **Parallel Function Calling**

In addition to single turn function calling, you can also call multiple functions at once. Parallel function calling lets you execute multiple functions at once and is used when the functions are not dependent on each other. This is useful in scenarios like gathering data from multiple independent sources, such as retrieving customer details from different databases or checking inventory levels across various warehouses or performing multiple actions such as converting your apartment into a disco.

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
import { Type } from '@google/genai';

const powerDiscoBall \= {  
  name: 'power\_disco\_ball',  
  description: 'Powers the spinning disco ball.',  
  parameters: {  
    type: Type.OBJECT,  
    properties: {  
      power: {  
        type: Type.BOOLEAN,  
        description: 'Whether to turn the disco ball on or off.'  
      }  
    },  
    required: \['power'\]  
  }  
};

const startMusic \= {  
  name: 'start\_music',  
  description: 'Play some music matching the specified parameters.',  
  parameters: {  
    type: Type.OBJECT,  
    properties: {  
      energetic: {  
        type: Type.BOOLEAN,  
        description: 'Whether the music is energetic or not.'  
      },  
      loud: {  
        type: Type.BOOLEAN,  
        description: 'Whether the music is loud or not.'  
      }  
    },  
    required: \['energetic', 'loud'\]  
  }  
};

const dimLights \= {  
  name: 'dim\_lights',  
  description: 'Dim the lights.',  
  parameters: {  
    type: Type.OBJECT,  
    properties: {  
      brightness: {  
        type: Type.NUMBER,  
        description: 'The brightness of the lights, 0.0 is off, 1.0 is full.'  
      }  
    },  
    required: \['brightness'\]  
  }  
};

Call the model with an instruction that could use all of the specified tools. This example uses a `tool_config`. To learn more you can read about [configuring function calling](https://ai.google.dev/gemini-api/docs/function-calling#function_calling_modes).

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
import { GoogleGenAI } from '@google/genai';

// Set up function declarations  
const houseFns \= \[powerDiscoBall, startMusic, dimLights\];

const config \= {  
    tools: \[{  
        functionDeclarations: houseFns  
    }\],  
    // Force the model to call 'any' function, instead of chatting.  
    toolConfig: {  
        functionCallingConfig: {  
        mode: 'any'  
        }  
    }  
};

// Configure the client  
const ai \= new GoogleGenAI({ apiKey: process.env.GEMINI\_API\_KEY });

// Create a chat session  
const chat \= ai.chats.create({  
    model: 'gemini-2.0-flash',  
    config: config  
});  
const response \= await chat.sendMessage({message: 'Turn this place into a party\!'});

// Print out each of the function calls requested from this single call  
console.log("Example 1: Forced function calling");  
for (const fn of response.functionCalls) {  
    const args \= Object.entries(fn.args)  
        .map((\[key, val\]) \=\> \`${key}=${val}\`)  
        .join(', ');  
    console.log(\`${fn.name}(${args})\`);  
}

Each of the printed results reflects a single function call that the model has requested. To send the results back, include the responses in the same order as they were requested.

The Python SDK supports a feature called [automatic function calling](https://ai.google.dev/gemini-api/docs/function-calling#automatic_function_calling_python_only) which converts the Python function to declarations, handles the function call execution and response cycle for you. Following is an example for our disco use case.

**Note:** Automatic Function Calling is a Python SDK only feature at the moment.

[Python](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#python)  
from google import genai  
from google.genai import types

\# Actual implementation functions  
def power\_disco\_ball\_impl(power: bool) \-\> dict:  
    """Powers the spinning disco ball.

    Args:  
        power: Whether to turn the disco ball on or off.

    Returns:  
        A status dictionary indicating the current state.  
    """  
    return {"status": f"Disco ball powered {'on' if power else 'off'}"}

def start\_music\_impl(energetic: bool, loud: bool) \-\> dict:  
    """Play some music matching the specified parameters.

    Args:  
        energetic: Whether the music is energetic or not.  
        loud: Whether the music is loud or not.

    Returns:  
        A dictionary containing the music settings.  
    """  
    music\_type \= "energetic" if energetic else "chill"  
    volume \= "loud" if loud else "quiet"  
    return {"music\_type": music\_type, "volume": volume}

def dim\_lights\_impl(brightness: float) \-\> dict:  
    """Dim the lights.

    Args:  
        brightness: The brightness of the lights, 0.0 is off, 1.0 is full.

    Returns:  
        A dictionary containing the new brightness setting.  
    """  
    return {"brightness": brightness}

config \= {  
    "tools": \[power\_disco\_ball\_impl, start\_music\_impl, dim\_lights\_impl\],  
}

chat \= client.chats.create(model="gemini-2.0-flash", config=config)  
response \= chat.send\_message("Do everything you need to this place into party\!")

print("\\nExample 2: Automatic function calling")  
print(response.text)  
\# I've turned on the disco ball, started playing loud and energetic music, and dimmed the lights to 50% brightness. Let's get this party started\!

## **Compositional Function Calling**

Gemini 2.0 supports compositional function calling, meaning the model can chain multiple function calls together. For example, to answer "Get the temperature in my current location", the Gemini API might invoke both a `get_current_location()` function and a `get_weather()` function that takes the location as a parameter.

**Note:** Compositional function calling is a [Live API](https://ai.google.dev/gemini-api/docs/live) only feature at the moment. The **`run()`** function declaration, which handles the asynchronous websocket setup, is omitted for brevity.

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
// Light control schemas  
const turnOnTheLightsSchema \= { name: 'turn\_on\_the\_lights' };  
const turnOffTheLightsSchema \= { name: 'turn\_off\_the\_lights' };

const prompt \= \`  
  Hey, can you write run some python code to turn on the lights, wait 10s and then turn off the lights?  
\`;

const tools \= \[  
  { codeExecution: {} },  
  { functionDeclarations: \[turnOnTheLightsSchema, turnOffTheLightsSchema\] }  
\];

await run(prompt, tools=tools, modality="AUDIO")

## **Function calling modes**

The Gemini API lets you control how the model uses the provided tools (function declarations). Specifically, you can set the mode within the `function_calling_config`.

* `AUTO (Default)`: The model decides whether to generate a natural language response or suggest a function call based on the prompt and context. This is the most flexible mode and recommended for most scenarios.  
* `ANY`: The model is constrained to always predict a function call and guarantee function schema adherence. If `allowed_function_names` is not specified, the model can choose from any of the provided function declarations. If `allowed_function_names` is provided as a list, the model can only choose from the functions in that list. Use this mode when you require a function call in response to every prompt (if applicable).  
* `NONE`: The model is *prohibited* from making function calls. This is equivalent to sending a request without any function declarations. Use this to temporarily disable function calling without removing your tool definitions.

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
import { FunctionCallingConfigMode } from '@google/genai';

// Configure function calling mode  
const toolConfig \= {  
  functionCallingConfig: {  
    mode: FunctionCallingConfigMode.ANY,  
    allowedFunctionNames: \['get\_current\_temperature'\]  
  }  
};

// Create the generation config  
const config \= {  
  temperature: 0,  
  tools: tools, // not defined here.  
  toolConfig: toolConfig,  
};

## **Automatic Function Calling (Python Only)**

When using the Python SDK, you can provide Python functions directly as tools. The SDK automatically converts the Python function to declarations, handles the function call execution and response cycle for you. The Python SDK then automatically:

1. Detects function call responses from the model.  
2. Call the corresponding Python function in your code.  
3. Sends the function response back to the model.  
4. Returns the model's final text response.

To use this, define your function with type hints and a docstring, and then pass the function itself (not a JSON declaration) as a tool:

[Python](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#python)  
from google import genai  
from google.genai import types

\# Define the function with type hints and docstring  
def get\_current\_temperature(location: str) \-\> dict:  
    """Gets the current temperature for a given location.

    Args:  
        location: The city and state, e.g. San Francisco, CA

    Returns:  
        A dictionary containing the temperature and unit.  
    """  
    \# ... (implementation) ...  
    return {"temperature": 25, "unit": "Celsius"}

\# Configure the client and model  
client \= genai.Client(api\_key=os.getenv("GEMINI\_API\_KEY"))  \# Replace with your actual API key setup  
config \= types.GenerateContentConfig(  
    tools=\[get\_current\_temperature\]  
)  \# Pass the function itself

\# Make the request  
response \= client.models.generate\_content(  
    model="gemini-2.0-flash",  
    contents="What's the temperature in London?",  
    config=config,  
)

print(response.text)  \# The SDK handles the function call and returns the final text

You can disable automatic function calling with:

[Python](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#python)  
\# To disable automatic function calling:  
config \= types.GenerateContentConfig(  
    tools=\[get\_current\_temperature\],  
    automatic\_function\_calling=types.AutomaticFunctionCallingConfig(disable=True)  
)

### **Automatic Function schema declaration**

Automatic schema extraction from Python functions doesn't work in all cases. For example: it doesn't handle cases where you describe the fields of a nested dictionary-object. The API is able to describe any of the following types:

[Python](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#python)  
AllowedType \= (int | float | bool | str | list\['AllowedType'\] | dict\[str, AllowedType\])

To see what the inferred schema looks like, you can convert it using [`from_callable`](https://googleapis.github.io/python-genai/genai.html#genai.types.FunctionDeclaration.from_callable):

[Python](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#python)  
def multiply(a: float, b: float):  
    """Returns a \* b."""  
    return a \* b

fn\_decl \= types.FunctionDeclaration.from\_callable(callable=multiply, client=client)

\# to\_json\_dict() provides a clean JSON representation.  
print(fn\_decl.to\_json\_dict())

## **Multi-tool use: Combine Native Tools with Function Calling**

With Gemini 2.0, you can enable multiple tools combining native tools with function calling at the same time. Here's an example that enables two tools, [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/grounding) and [code execution](https://ai.google.dev/gemini-api/docs/code-execution), in a request using the [Live API](https://ai.google.dev/gemini-api/docs/live).

**Note:** Multi-tool use is a [Live API](https://ai.google.dev/gemini-api/docs/live) only feature at the moment. The **`run()`** function declaration, which handles the asynchronous websocket setup, is omitted for brevity.

[Python](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#python)

[JavaScript](https://ai.google.dev/gemini-api/docs/function-calling?example=chart#javascript)  
// Multiple tasks example \- combining lights, code execution, and search  
const prompt \= \`  
  Hey, I need you to do three things for me.

    1\.  Turn on the lights.  
    2\.  Then compute the largest prime palindrome under 100000\.  
    3\.  Then use Google Search to look up information about the largest earthquake in California the week of Dec 5 2024\.

  Thanks\!  
\`;

const tools \= \[  
  { googleSearch: {} },  
  { codeExecution: {} },  
  { functionDeclarations: \[turnOnTheLightsSchema, turnOffTheLightsSchema\] } // not defined here.  
\];

// Execute the prompt with specified tools in audio modality  
await run(prompt, {tools: tools, modality: "AUDIO"});

## **Best Practices**

* **Function and Parameter Descriptions:** Be extremely clear and specific in your descriptions. The model relies on these to choose the correct function and provide appropriate arguments.  
* **Naming:** Use descriptive function names (without spaces, periods, or dashes).  
* **Strong Typing:** Use specific types (integer, string, enum) for parameters to reduce errors. If a parameter has a limited set of valid values, use an enum.  
* **Prompt Engineering:**  
  * Provide context: Tell the model its role (e.g., "You are a helpful weather assistant.").  
  * Give instructions: Specify how and when to use functions (e.g., "Don't guess dates; always use a future date for forecasts.").  
  * Encourage clarification: Instruct the model to ask clarifying questions if needed.  
* **Temperature:** Use a low temperature (e.g., 0\) for more deterministic and reliable function calls.  
* **Validation:** If a function call has significant consequences (e.g., placing an order), validate the call with the user before executing it.  
* **Error Handling**: Implement robust error handling in your functions to gracefully handle unexpected inputs or API failures. Return informative error messages that the model can use to generate helpful responses to the user.  
* **Security:** Be mindful of security when calling external APIs. Use appropriate authentication and authorization mechanisms. Avoid exposing sensitive data in function calls.  
* **Token Limits:** Function descriptions and parameters count towards your input token limit. If you're hitting token limits, consider limiting the number of functions or the length of the descriptions, break down complex tasks into smaller, more focused function sets.

