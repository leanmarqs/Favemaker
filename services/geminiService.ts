
import { GoogleGenAI, Type } from "@google/genai";
import { AIGeneratedSite } from '../types';

const getApiKey = () => {
  const key = process.env.API_KEY;
  if (!key) {
    // In a real app, you might want to handle this more gracefully,
    // but for this context, we assume the key is available.
    console.error("API_KEY environment variable not set.");
    return "";
  }
  return key;
};

export const generateCollectionFromQuery = async (query: string): Promise<AIGeneratedSite[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Find the top 10 best websites for the topic: "${query}". For each website, provide its name, a valid URL, and a brief one-sentence description.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sites: {
              type: Type.ARRAY,
              description: "A list of the top 10 websites.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                    description: "The official name of the website."
                  },
                  url: {
                    type: Type.STRING,
                    description: "The full, valid URL of the website."
                  },
                  description: {
                    type: Type.STRING,
                    description: "A brief, one-sentence description of the website."
                  }
                },
                required: ["name", "url", "description"]
              }
            }
          }
        },
      },
    });

    const jsonString = response.text.trim();
    const parsed = JSON.parse(jsonString);
    return parsed.sites || [];
  } catch (error) {
    console.error("Error generating collection with Gemini:", error);
    // Return an empty array or throw the error to be handled by the caller
    throw new Error("Failed to generate collection. Please check your query and API key.");
  }
};
