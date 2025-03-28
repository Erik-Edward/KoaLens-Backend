Det låter som en bra plan. Låt oss uppdatera implementationsplanen för videoanalysstöd baserat på vad vi vet om Google's starter-applets.

## Uppdaterad implementationsplan för videoanalysstöd

### Backend-implementation

1. **Uppdatera GeminiService för videoanalys**
   ```typescript
   // src/services/geminiService.ts
   async generateContentFromVideo(prompt: string, videoBase64: string, mimeType: string = 'video/mp4'): Promise<any> {
     try {
       const model = this.genAI.getGenerativeModel({ model: this.modelName });
       
       // Förenkla multimodal input baserat på Google's exempel
       const result = await model.generateContent([
         prompt, 
         { 
           inlineData: { 
             data: videoBase64, 
             mimeType: mimeType 
           } 
         }
       ]);
       
       return result.response.text();
     } catch (error) {
       console.error('Gemini video processing error:', error);
       throw new Error(`Kunde inte analysera video: ${error.message}`);
     }
   }
   ```

2. **Skapa en optimerad prompt för videoanalys**
   ```typescript
   // src/config/promptTemplates.ts
   export const videoAnalysisPrompt = `
     Analysera denna video av en produktförpackning.
     
     Fokusera på att identifiera ingredienslistan som kan visas på en böjd yta.
     Titta noga på olika delar av videon då ingredienslistan kan visas i olika vinklar.
     
     Analysera om produkten är vegansk baserat på dessa ingredienser.
     
     Svara i följande JSON-format:
     {
       "isVegan": boolean eller null om osäker,
       "confidence": nummer mellan 0 och 1,
       "ingredientList": [lista över alla identifierade ingredienser],
       "nonVeganIngredients": [lista över identifierade icke-veganska ingredienser],
       "reasoning": "förklaring av ditt resonemang"
     }
   `;
   ```

3. **Skapa VideoAnalysisService med optimerad struktur**
   ```typescript
   // src/services/videoAnalysisService.ts
   import { AIServiceFactory } from './aiServiceFactory';
   import promptManager from '../utils/promptManager';
   
   export class VideoAnalysisService {
     async analyzeVideoIngredients(videoBase64: string, mimeType: string = 'video/mp4'): Promise<any> {
       try {
         // Hämta AI-tjänsten
         const aiService = await AIServiceFactory.getService();
         
         // Använd den optimerade prompten
         const prompt = promptManager.get('videoAnalysisPrompt');
         
         // Direkt anrop till Gemini med video input
         const response = await aiService.generateContentFromVideo(prompt, videoBase64, mimeType);
         
         // Parsa och returnera resultatet
         return this.parseAnalysisResult(response);
       } catch (error) {
         console.error('Video analysis error:', error);
         throw error;
       }
     }
     
     private parseAnalysisResult(response: string): any {
       try {
         // Extrahera och validera JSON från svaret
         return JSON.parse(response);
       } catch (error) {
         console.error('Error parsing analysis result:', error);
         throw new Error('Kunde inte tolka analysresultatet');
       }
     }
   }
   ```

### Frontend-implementation

1. **Skapa VideoRecorder-komponent**
   ```tsx
   // app/components/VideoRecorder.tsx
   import React, { useState, useRef } from 'react';
   import { View, Button, StyleSheet } from 'react-native';
   import { Camera } from 'expo-camera';
   import * as FileSystem from 'expo-file-system';
   
   export default function VideoRecorder({ onVideoRecorded }) {
     const [isRecording, setIsRecording] = useState(false);
     const [permission, requestPermission] = Camera.useCameraPermissions();
     const cameraRef = useRef(null);
     
     const startRecording = async () => {
       if (cameraRef.current) {
         setIsRecording(true);
         const video = await cameraRef.current.recordAsync({
           maxDuration: 10, // Begränsa till 10 sekunder
           quality: Camera.Constants.VideoQuality['720p'], // Balanserad kvalitet
         });
         
         setIsRecording(false);
         processVideo(video.uri);
       }
     };
     
     const stopRecording = () => {
       if (cameraRef.current && isRecording) {
         cameraRef.current.stopRecording();
         setIsRecording(false);
       }
     };
     
     const processVideo = async (videoUri) => {
       try {
         // Läs videofilen som base64
         const base64Data = await FileSystem.readAsStringAsync(videoUri, {
           encoding: FileSystem.EncodingType.Base64,
         });
         
         // Skicka videoinspelningen till analysfunktionen
         onVideoRecorded(base64Data);
       } catch (error) {
         console.error('Error processing video:', error);
         alert('Det gick inte att bearbeta videon');
       }
     };
     
     if (!permission) {
       return <View><Button title="Bevilja kameraåtkomst" onPress={requestPermission} /></View>;
     }
     
     return (
       <View style={styles.container}>
         <Camera
           ref={cameraRef}
           style={styles.camera}
           type={Camera.Constants.Type.back}
         />
         <View style={styles.controls}>
           {isRecording ? (
             <Button title="Avsluta inspelning" onPress={stopRecording} color="red" />
           ) : (
             <Button title="Spela in (max 10s)" onPress={startRecording} />
           )}
         </View>
       </View>
     );
   }
   
   const styles = StyleSheet.create({
     container: {
       flex: 1,
     },
     camera: {
       flex: 1,
     },
     controls: {
       position: 'absolute',
       bottom: 20,
       width: '100%',
       alignItems: 'center',
     },
   });
   ```

2. **Uppdatera AnalysisService för att hantera video**
   ```typescript
   // app/services/analysisService.ts
   // Lägg till dessa metoder i den befintliga AnalysisService
   
   async analyzeVideo(videoBase64: string): Promise<any> {
     try {
       this.setLoading(true);
       this.updateProgress(10, 'Förbereder videoanalys...');
       
       // Validera videon
       if (!videoBase64) {
         throw new Error('Ingen video att analysera');
       }
       
       this.updateProgress(20, 'Optimerar video...');
       
       // API-anrop för videoanalys
       const apiUrl = `${this.apiBaseUrl}/api/video/analyze-video`;
       const response = await fetch(apiUrl, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
           video: videoBase64,
           mimeType: 'video/mp4',
           preferredLanguage: this.preferredLanguage
         }),
       });
       
       this.updateProgress(70, 'Bearbetar analysresultat...');
       
       if (!response.ok) {
         const errorData = await response.json();
         throw new Error(errorData.message || 'Fel vid videoanalys');
       }
       
       const result = await response.json();
       this.updateProgress(100, 'Analys klar!');
       
       return result;
     } catch (error) {
       console.error('Video analysis error:', error);
       this.updateProgress(0, 'Analys misslyckades');
       throw error;
     } finally {
       this.setLoading(false);
     }
   }
   ```

3. **Skapa en VideoAnalysis-skärm**
   ```tsx
   // app/(tabs)/(scan)/video-analysis.tsx
   import React, { useState } from 'react';
   import { View, Text, StyleSheet, Alert } from 'react-native';
   import { router } from 'expo-router';
   import { AnalysisService } from '@/services/analysisService';
   import VideoRecorder from '@/components/VideoRecorder';
   import LoadingOverlay from '@/components/LoadingOverlay';
   
   export default function VideoAnalysisScreen() {
     const [isLoading, setIsLoading] = useState(false);
     const [progress, setProgress] = useState(0);
     const [statusText, setStatusText] = useState('');
     
     const handleVideoRecorded = async (videoBase64) => {
       try {
         setIsLoading(true);
         
         const analysisService = new AnalysisService();
         analysisService.onProgressUpdate = (progress, status) => {
           setProgress(progress);
           setStatusText(status);
         };
         
         // Analysera videon
         const analysisResult = await analysisService.analyzeVideo(videoBase64);
         
         // Navigera till resultatskärmen med analysen
         router.replace({
           pathname: '/(tabs)/(scan)/result',
           params: { 
             analysisResult: JSON.stringify(analysisResult),
             isVideoAnalysis: 'true'
           }
         });
       } catch (error) {
         console.error('Analysis error:', error);
         Alert.alert(
           'Analysen misslyckades',
           error.message || 'Kunde inte analysera videon',
           [{ text: 'OK' }]
         );
       } finally {
         setIsLoading(false);
       }
     };
     
     return (
       <View style={styles.container}>
         {isLoading ? (
           <LoadingOverlay progress={progress} statusText={statusText} />
         ) : (
           <>
             <Text style={styles.title}>Videoscanning</Text>
             <Text style={styles.instruction}>
               Spela in en kort video (max 10 sekunder) medan du långsamt panorerar runt produkten för att fånga ingredienslistan.
             </Text>
             <VideoRecorder onVideoRecorded={handleVideoRecorded} />
           </>
         )}
       </View>
     );
   }
   
   const styles = StyleSheet.create({
     container: {
       flex: 1,
       backgroundColor: '#fff',
     },
     title: {
       fontSize: 20,
       fontWeight: 'bold',
       textAlign: 'center',
       margin: 10,
     },
     instruction: {
       textAlign: 'center',
       margin: 10,
       marginBottom: 20,
     },
   });
   ```

4. **Uppdatera skanningsskärmen med videoalternativ**
   ```tsx
   // app/(tabs)/(scan)/index.tsx
   // Lägg till en knapp för videoanalys i befintlig skanningsskärm
   
   <StyledPressable 
     onPress={() => router.push('/(tabs)/(scan)/video-analysis')}
     className="flex-row items-center justify-center bg-blue-600 py-3 px-4 rounded-md mb-4"
   >
     <Ionicons name="videocam-outline" size={20} color="white" />
     <StyledText className="text-white font-sans-bold ml-2">
       Videoscanning (för böjda ytor)
     </StyledText>
   </StyledPressable>
   ```

Detta är en solid början på implementationen baserat på det vi vet om Google's starter-applets. Vi kan förfina detaljerna när vi startar en ny chattsession och får tillgång till originalkoden från repot.
