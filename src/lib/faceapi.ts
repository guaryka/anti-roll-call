import * as faceapi from 'face-api.js';

let modelsLoaded = false;

export const loadModels = async () => {
  if (modelsLoaded) return;
  
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
  
  // Load more models for higher accuracy
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]);
  
  modelsLoaded = true;
};

// Detection options for higher accuracy
const ssdOptions = new faceapi.SsdMobilenetv1Options({ 
  minConfidence: 0.5,  // Higher confidence threshold
  maxResults: 10
});

const tinyFaceOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 608,      // Larger input size for better accuracy (160, 224, 320, 416, 512, 608)
  scoreThreshold: 0.5  // Higher score threshold
});

export const detectFace = async (imageElement: HTMLImageElement): Promise<Float32Array | null> => {
  await loadModels();
  
  // Try with SSD MobileNet first (more accurate but slower)
  let detection = await faceapi
    .detectSingleFace(imageElement, ssdOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();
  
  // If no face found, try with TinyFaceDetector (faster, better for smaller faces)
  if (!detection) {
    detection = await faceapi
      .detectSingleFace(imageElement, tinyFaceOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();
  }
  
  if (!detection) return null;
  
  return detection.descriptor;
};

// Detect all faces in an image for more comprehensive matching
export const detectAllFaces = async (imageElement: HTMLImageElement): Promise<Float32Array[]> => {
  await loadModels();
  
  const detections = await faceapi
    .detectAllFaces(imageElement, ssdOptions)
    .withFaceLandmarks()
    .withFaceDescriptors();
  
  return detections.map(d => d.descriptor);
};

// Get face detection confidence score
export const getFaceConfidence = async (imageElement: HTMLImageElement): Promise<number | null> => {
  await loadModels();
  
  const detection = await faceapi.detectSingleFace(imageElement, ssdOptions);
  
  if (!detection) return null;
  
  return detection.score;
};

export const compareFaces = (descriptor1: Float32Array, descriptor2: Float32Array): number => {
  const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
  
  // More accurate similarity calculation
  // Euclidean distance typically ranges from 0 to ~1.5 for face descriptors
  // - < 0.4: Very likely same person (high match)
  // - 0.4 - 0.5: Likely same person
  // - 0.5 - 0.6: Possibly same person
  // - > 0.6: Different persons
  
  // Convert to percentage with better scaling
  let similarity: number;
  if (distance < 0.4) {
    // High match: 85-100%
    similarity = 100 - (distance / 0.4) * 15;
  } else if (distance < 0.5) {
    // Good match: 70-85%
    similarity = 85 - ((distance - 0.4) / 0.1) * 15;
  } else if (distance < 0.6) {
    // Moderate match: 50-70%
    similarity = 70 - ((distance - 0.5) / 0.1) * 20;
  } else {
    // Low match: 0-50%
    similarity = Math.max(0, 50 - ((distance - 0.6) / 0.4) * 50);
  }
  
  return Math.round(similarity * 100) / 100;
};

// Enhanced comparison with multiple descriptors
export const compareFacesAdvanced = (
  targetDescriptor: Float32Array, 
  storedDescriptors: Float32Array[]
): { bestMatch: number; averageMatch: number; allMatches: number[] } => {
  if (storedDescriptors.length === 0) {
    return { bestMatch: 0, averageMatch: 0, allMatches: [] };
  }

  const allMatches = storedDescriptors.map(stored => compareFaces(targetDescriptor, stored));
  const bestMatch = Math.max(...allMatches);
  const averageMatch = allMatches.reduce((a, b) => a + b, 0) / allMatches.length;

  return { bestMatch, averageMatch, allMatches };
};

export const descriptorToArray = (descriptor: Float32Array): number[] => {
  return Array.from(descriptor);
};

export const arrayToDescriptor = (array: number[]): Float32Array => {
  return new Float32Array(array);
};
