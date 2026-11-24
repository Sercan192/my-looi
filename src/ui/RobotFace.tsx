import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { isRealtimeConversationMode, useUserStore, type FacePaletteId, type FaceStyleId, type VoiceState } from "@/src/store/user";
import { useConversationStore } from "@/src/store/conversation";
import { looiTheme } from "@/src/ui/looi-theme";
import { useUiText } from "@/src/i18n/use-ui-text";
import { useCharacterReactionStore, type CharacterMood } from "@/src/character/character-reaction";
import { recordDiagnosticEvent } from "@/src/diagnostics/diagnostic-log";
import { useSocialAttentionStore } from "@/src/core/social-attention";

type RobotFaceMode = "fullscreen" | "avatar";

type RobotFaceProps = {
  mode?: RobotFaceMode;
  onPress?: () => void;
  onLongPress?: () => void;
  labelVisible?: boolean;
};

type FaceMood = "neutral" | "happy" | "excited" | "curious" | "concerned";
type MouthShape = "none" | "line" | "smile" | "dot";

type FaceVisual = {
  leftEyeScaleX: number;
  leftEyeScaleY: number;
  rightEyeScaleX: number;
  rightEyeScaleY: number;
  leftEyeOffsetY: number;
  rightEyeOffsetY: number;
  leftEyeRotation: number;
  rightEyeRotation: number;
  pupilScale: number;
  bottomLidLift: number;
  topLidDrop: number;
  mouth: MouthShape;
  mouthWidth: number;
};

type FaceStyleVisual = {
  eyeWidthScale: number;
  eyeHeightScale: number;
  eyeRadius: number;
  eyeGapScale: number;
  mouthWidthScale: number;
  idleMouth: MouthShape;
  idleMouthWidth: number;
  leftEyeRotationOffset: number;
  rightEyeRotationOffset: number;
  decor: "none" | "lashes" | "brows" | "fringe" | "cowboy" | "bandana";
};

type FacePaletteVisual = {
  eyeColor: string;
  eyeShadowColor: string;
  eyeGlow: string;
  mouthColor: string;
  accentColor: string;
};

const FACE_STYLES: Record<FaceStyleId, FaceStyleVisual> = {
  classic: {
    eyeWidthScale: 1, eyeHeightScale: 1, eyeRadius: 999, eyeGapScale: 1,
    mouthWidthScale: 1, idleMouth: "none", idleMouthWidth: 0,
    leftEyeRotationOffset: 0, rightEyeRotationOffset: 0, decor: "none",
  },
  soft: {
    eyeWidthScale: 1.03, eyeHeightScale: 1.1, eyeRadius: 999, eyeGapScale: 0.94,
    mouthWidthScale: 0.88, idleMouth: "smile", idleMouthWidth: 28,
    leftEyeRotationOffset: -2, rightEyeRotationOffset: 2, decor: "lashes",
  },
  playful: {
    eyeWidthScale: 1.08, eyeHeightScale: 0.92, eyeRadius: 999, eyeGapScale: 0.9,
    mouthWidthScale: 1, idleMouth: "dot", idleMouthWidth: 11,
    leftEyeRotationOffset: -4, rightEyeRotationOffset: 5, decor: "brows",
  },
  fringe: {
    eyeWidthScale: 0.92, eyeHeightScale: 0.84, eyeRadius: 42, eyeGapScale: 1.04,
    mouthWidthScale: 1.08, idleMouth: "smile", idleMouthWidth: 40,
    leftEyeRotationOffset: -2, rightEyeRotationOffset: 2, decor: "fringe",
  },
  sharp: {
    eyeWidthScale: 1.08, eyeHeightScale: 0.72, eyeRadius: 26, eyeGapScale: 1.04,
    mouthWidthScale: 0.88, idleMouth: "line", idleMouthWidth: 24,
    leftEyeRotationOffset: -5, rightEyeRotationOffset: 5, decor: "brows",
  },
  cowboy: {
    eyeWidthScale: 0.88, eyeHeightScale: 0.72, eyeRadius: 30, eyeGapScale: 1.08,
    mouthWidthScale: 1.14, idleMouth: "smile", idleMouthWidth: 44,
    leftEyeRotationOffset: -3, rightEyeRotationOffset: 3, decor: "cowboy",
  },
  bandana: {
    eyeWidthScale: 0.90, eyeHeightScale: 0.86, eyeRadius: 38, eyeGapScale: 1.02,
    mouthWidthScale: 1.18, idleMouth: "line", idleMouthWidth: 38,
    leftEyeRotationOffset: -2, rightEyeRotationOffset: 2, decor: "bandana",
  },
};

const FACE_PALETTES: Record<FacePaletteId, FacePaletteVisual> = {
  cyan: {
    eyeColor: "#54DCF2", eyeShadowColor: "#2442D8", eyeGlow: "rgba(84,220,242,0.45)",
    mouthColor: "#54DCF2", accentColor: "#9AF4FF",
  },
  rose: {
    eyeColor: "#FF8BD1", eyeShadowColor: "#7A4BE8", eyeGlow: "rgba(255,139,209,0.42)",
    mouthColor: "#FF9BD8", accentColor: "#FFD1EE",
  },
  lime: {
    eyeColor: "#9EF06A", eyeShadowColor: "#1F7FE0", eyeGlow: "rgba(158,240,106,0.40)",
    mouthColor: "#9EF06A", accentColor: "#D6FFB5",
  },
  amber: {
    eyeColor: "#FFB454", eyeShadowColor: "#E04355", eyeGlow: "rgba(255,180,84,0.42)",
    mouthColor: "#FFC15A", accentColor: "#FFE8B0",
  },
  violet: {
    eyeColor: "#B99AFF", eyeShadowColor: "#4858E8", eyeGlow: "rgba(185,154,255,0.42)",
    mouthColor: "#CFB8FF", accentColor: "#EAE0FF",
  },
};

const SPRING_CONFIG = { damping: 14, stiffness: 185, mass: 0.72 };
const ZERO_ONE = new Array<number>(0, 1);

export function RobotFace(props: RobotFaceProps) {
  return <ClassicRobotFace {...props} />;
}

function ClassicRobotFace({
  mode = "fullscreen",
  onPress,
  onLongPress,
  labelVisible = mode === "fullscreen",
}: RobotFaceProps) {
  const voiceState = useUserStore((state) => state.voiceState);
  const faceStyleId = useUserStore((state) => state.preferences.faceStyle);
  const facePaletteId = useUserStore((state) => state.preferences.facePalette);
  const faceStyle = FACE_STYLES[faceStyleId] ?? FACE_STYLES.classic;
  const palette = FACE_PALETTES[facePaletteId] ?? FACE_PALETTES.cyan;
  const streamingText = useConversationStore((state) => state.streamingText);
  const isUserSpeaking = useConversationStore((state) => state.isUserSpeaking);
  const realtimeReadiness = useConversationStore((state) => state.realtimeReadiness);
  const conversationMode = useUserStore((state) => state.preferences.conversationMode);
  const characterMood = useCharacterReactionStore((state) => state.mood);
  const { t } = useUiText();
  const characterReactionId = useCharacterReactionStore((state) => state.reactionId);
  const socialAttentionActive = useSocialAttentionStore((state) => state.active);
  const socialFaceVisible = useSocialAttentionStore((state) => state.faceVisible);
  const socialGazeX = useSocialAttentionStore((state) => state.gazeX);
  const socialGazeY = useSocialAttentionStore((state) => state.gazeY);

  const blink = useSharedValue(1);
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const torsionZ = useSharedValue(0);
  const speakPulse = useSharedValue(0);
  const mouthPulse = useSharedValue(0);

  const simTime = useSharedValue(0);
  const nextLookChange = useSharedValue(0.8);
  const targetLookX = useSharedValue(0);
  const targetLookY = useSharedValue(0);
  const currLookX = useSharedValue(0);
  const currLookY = useSharedValue(0);
  const isGlancing = useSharedValue(false);

  const nextJitterTime = useSharedValue(0.2);
  const tickOffsetX = useSharedValue(0);
  const tickOffsetY = useSharedValue(0);
  const targetJitterX = useSharedValue(0);
  const targetJitterY = useSharedValue(0);
  const currJitterX = useSharedValue(0);
  const currJitterY = useSharedValue(0);

  const nextAudioShift = useSharedValue(0);
  const targetAudioX = useSharedValue(0);
  const targetAudioY = useSharedValue(0);
  const currAudioX = useSharedValue(0);
  const currAudioY = useSharedValue(0);
  const nextSyllableTime = useSharedValue(0);
  const targetLoudness = useSharedValue(0);
  const currLoudness = useSharedValue(0);

  const nextMicro3D = useSharedValue(0);
  const targetMicroZ = useSharedValue(0);
  const currMicroZ = useSharedValue(0);

  const isSpeakingSV = useSharedValue(false);
  const isUserSpeakingSV = useSharedValue(false);
  const isSleepingSV = useSharedValue(false);
  const socialActiveSV = useSharedValue(false);
  const socialXSV = useSharedValue(0);
  const socialYSV = useSharedValue(0);

  const animLeftScaleX = useSharedValue(1);
  const animLeftScaleY = useSharedValue(1);
  const animRightScaleX = useSharedValue(1);
  const animRightScaleY = useSharedValue(1);
  const animPupilScale = useSharedValue(1);
  const animBottomLid = useSharedValue(0);
  const animTopLid = useSharedValue(0);

  const longPressFired = useRef(false);
  const isAvatar = mode === "avatar";

  const statusLabel = isRealtimeConversationMode(conversationMode)
    ? voiceState === "speaking"
      ? t("face.speaking")
      : voiceState === "processing"
        ? t("face.thinking")
        : realtimeReadiness === "preparing-microphone"
          ? t("overlay.preparingMic")
          : realtimeReadiness === "connecting"
            ? t("overlay.connecting")
            : realtimeReadiness === "ready"
              ? t("overlay.readyListening")
              : realtimeReadiness === "microphone-error"
                ? t("overlay.micNotReady")
                : realtimeReadiness === "error"
                  ? t("overlay.noConnection")
                  : t("face.tapToStart")
    : voiceState === "sleeping"
      ? t("face.ready")
      : voiceState === "attention"
        ? t("face.here")
        : voiceState === "listening"
          ? t("face.listening")
          : voiceState === "processing"
            ? t("face.thinking")
            : voiceState === "speaking"
              ? t("face.speaking")
              : t("face.verifying");

  const characterReactionVisible = Boolean(characterMood) && (
    voiceState === "sleeping" ||
    (isRealtimeConversationMode(conversationMode) && voiceState === "listening")
  );

  const face = useMemo(
    () => getFaceForState(voiceState, streamingText, characterReactionVisible ? characterMood : null),
    [characterMood, characterReactionVisible, streamingText, voiceState]
  );

  useEffect(() => {
    isSpeakingSV.value = voiceState === "speaking";
    isUserSpeakingSV.value = Boolean(isUserSpeaking);
    isSleepingSV.value = voiceState === "sleeping";
    socialActiveSV.value = Boolean(socialAttentionActive && socialFaceVisible);
    socialXSV.value = socialGazeX;
    socialYSV.value = socialGazeY;
  }, [
    isSleepingSV,
    isSpeakingSV,
    isUserSpeaking,
    isUserSpeakingSV,
    socialActiveSV,
    socialAttentionActive,
    socialFaceVisible,
    socialGazeX,
    socialGazeY,
socialXSV,
socialYSV,
voiceState,
]);
useEffect(() => {
animLeftScaleX.value = withSpring(face.leftEyeScaleX, SPRING_CONFIG);
animLeftScaleY.value = withSpring(face.leftEyeScaleY, SPRING_CONFIG);
animRightScaleX.value = withSpring(face.rightEyeScaleX, SPRING_CONFIG);
animRightScaleY.value = withSpring(face.rightEyeScaleY, SPRING_CONFIG);
animPupilScale.value = withSpring(face.pupilScale, SPRING_CONFIG);
animBottomLid.value = withSpring(face.bottomLidLift, SPRING_CONFIG);
animTopLid.value = withSpring(face.topLidDrop, SPRING_CONFIG);
}, [
animBottomLid,
animLeftScaleX,
animLeftScaleY,
animPupilScale,
animRightScaleX,
animRightScaleY,
animTopLid,
face,
]);
useEffect(() => {
if (!characterMood) return;
recordDiagnosticEvent("character", "reaction-render-state", {
mood: characterMood,
reactionId: characterReactionId,
voiceState,
conversationMode,
visible: characterReactionVisible,
});
}, [characterMood, characterReactionId, characterReactionVisible, conversationMode, voiceState]);
useFrameCallback((frameInfo) => {
const dt = Math.min(0.05, (frameInfo.timeSincePreviousFrame ?? 16.67) / 1000);
simTime.value += dt;
const now = simTime.value;
const playing = isSpeakingSV.value;
const userTalking = isUserSpeakingSV.value;
const sleeping = isSleepingSV.value;
if (playing || userTalking) {
if (now >= nextSyllableTime.value) {
targetLoudness.value = playing
? 0.25 + Math.random() * 0.75
: 0.2 + Math.random() * 0.55;
nextSyllableTime.value = now + 0.09 + Math.random() * 0.14;
}
} else {
targetLoudness.value = 0;
}
currLoudness.value += (targetLoudness.value - currLoudness.value) * Math.min(1.0, dt * 18.0);
const loudness = currLoudness.value;
speakPulse.value = loudness;
mouthPulse.value = playing ? loudness : 0;
const intervalMult = playing ? 0.95 : userTalking ? 0.8 : sleeping ? 2.1 : 1.2;
if (now >= nextLookChange.value) {
if (!sleeping && Math.random() < 0.28) {
blink.value = withSequence(
withTiming(0.06, { duration: 60, easing: Easing.out(Easing.quad) }),
withSpring(1, { damping: 13, stiffness: 220 })
);
}
if (socialActiveSV.value) {
targetLookX.value = socialXSV.value * 0.85 + (Math.random() - 0.5) * 0.08;
targetLookY.value = socialYSV.value * 0.85 + (Math.random() - 0.5) * 0.06;
nextLookChange.value = now + 0.35 + Math.random() * 0.45;
} else if (userTalking) {
targetLookX.value = (Math.random() - 0.5) * 0.14;
targetLookY.value = -0.06 + (Math.random() - 0.5) * 0.08;
nextLookChange.value = now + 0.45 + Math.random() * 0.5;
} else if (isGlancing.value) {
targetLookX.value = (Math.random() - 0.5) * 0.08;
targetLookY.value = (Math.random() - 0.5) * 0.05;
isGlancing.value = false;
nextLookChange.value = now + (1.1 + Math.random() * 1.4) * intervalMult;
} else {
const shouldGlanceAway = Math.random() < 0.38;
if (shouldGlanceAway) {
isGlancing.value = true;
const dir = Math.random() > 0.5 ? 1 : -1;
const randX = dir * (0.55 + Math.random() * 0.45);
let randY = (Math.random() - 0.5) * 0.35;
const xIntensity = Math.abs(randX);
randY *= Math.max(0.2, 1.0 - xIntensity * 0.6);
targetLookX.value = randX;
targetLookY.value = randY;
nextLookChange.value = now + (0.65 + Math.random() * 0.85) * intervalMult;
} else {
const randX = (Math.random() - 0.5) * 0.46;
let randY = (Math.random() - 0.5) * 0.24;
const xIntensity = Math.abs(randX) * 2.0;
randY *= Math.max(0.3, 1.0 - xIntensity * 0.5);
targetLookX.value = randX;
targetLookY.value = randY;
nextLookChange.value = now + (0.9 + Math.random() * 1.3) * intervalMult;
}
}
}
const dx = targetLookX.value - currLookX.value;
const dy = targetLookY.value - currLookY.value;
const dist = Math.sqrt(dx * dx + dy * dy);
const speedMult = playing ? 1.25 : 0.9;
const baseSpeed = 24.0 * speedMult;
const snapFactor = Math.min(1.0, dt * baseSpeed * (1.0 + dist * 5.0));
currLookX.value += dx * snapFactor;
currLookY.value += dy * snapFactor;
const jitterMult = playing ? 0.65 : sleeping ? 0.15 : 0.48;
if (now >= nextJitterTime.value) {
tickOffsetX.value = (Math.random() - 0.5) * 0.06 * jitterMult;
tickOffsetY.value = (Math.random() - 0.5) * 0.05 * jitterMult;
targetJitterX.value = (Math.random() - 0.5) * 0.08 * jitterMult;
targetJitterY.value = (Math.random() - 0.5) * 0.06 * jitterMult;
nextJitterTime.value = now + (0.25 + Math.random() * 0.5) * (playing ? 1.0 : 1.4);
}
const tickDecay = Math.min(1.0, dt * 25.0);
tickOffsetX.value *= 1.0 - tickDecay;
tickOffsetY.value *= 1.0 - tickDecay;
const jitterLerp = Math.min(1.0, dt * 11.0);
currJitterX.value += (targetJitterX.value - currJitterX.value) * jitterLerp;
currJitterY.value += (targetJitterY.value - currJitterY.value) * jitterLerp;
if (loudness > 0.05 && now >= nextAudioShift.value) {
targetAudioX.value = (Math.random() - 0.5) * loudness * 0.12;
targetAudioY.value = (Math.random() - 0.5) * loudness * 0.09;
nextAudioShift.value = now + 0.14 + Math.random() * 0.18;
} else if (loudness <= 0.05) {
targetAudioX.value = 0;
targetAudioY.value = 0;
}
const audioLerp = Math.min(1.0, dt * 12.0);
currAudioX.value += (targetAudioX.value - currAudioX.value) * audioLerp;
currAudioY.value += (targetAudioY.value - currAudioY.value) * audioLerp;
if (now >= nextMicro3D.value) {
targetMicroZ.value = (Math.random() - 0.5) * (playing ? 2.6 : 1.1);
nextMicro3D.value = now + 0.7 + Math.random() * 0.8;
}
currMicroZ.value += (targetMicroZ.value - currMicroZ.value) * Math.min(1.0, dt * 9.0);
lookX.value = currLookX.value + currJitterX.value + tickOffsetX.value + currAudioX.value;
lookY.value = currLookY.value + currJitterY.value + tickOffsetY.value + currAudioY.value;
torsionZ.value = currMicroZ.value;
});
useEffect(() => {
let blinkCount = 0;
const runBlink = () => {
blinkCount += 1;
if (blinkCount % 3 === 0) {
blink.value = withSequence(
withTiming(0.05, { duration: 60, easing: Easing.out(Easing.quad) }),
withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
withDelay(65, withTiming(0.05, { duration: 60, easing: Easing.out(Easing.quad) })),
withSpring(1, { damping: 12, stiffness: 220 })
);
} else {
blink.value = withSequence(
withTiming(0.05, { duration: 65, easing: Easing.out(Easing.quad) }),
withSpring(1, { damping: 12, stiffness: 210 })
);
}
};
const interval = voiceState === "processing" ? 2800 : 4100;
const timer = setInterval(runBlink, interval);
return () => {
clearInterval(timer);
cancelAnimation(blink);
};
}, [blink, voiceState]);
const gazeTravelX = isAvatar ? 4 : 25;
const gazeTravelY = isAvatar ? 2.5 : 14;
const leftEyeMotionStyle = useAnimatedStyle(() => ({
transform: [
{ scaleX: animLeftScaleX.value * interpolate(speakPulse.value, ZERO_ONE, new Array(1, 1.05)) },
{ scaleY: animLeftScaleY.value * blink.value * interpolate(speakPulse.value, ZERO_ONE, new Array(1, 1.07)) },
{ translateX: lookX.value * gazeTravelX },
{ translateY: lookY.value * gazeTravelY },
{ rotate: ${torsionZ.value}deg },
],
}));
const rightEyeMotionStyle = useAnimatedStyle(() => ({
transform: [
{ scaleX: animRightScaleX.value * interpolate(speakPulse.value, ZERO_ONE, new Array(1, 1.05)) },
{ scaleY: animRightScaleY.value * blink.value * interpolate(speakPulse.value, ZERO_ONE, new Array(1, 1.07)) },
{ translateX: lookX.value * gazeTravelX },
{ translateY: lookY.value * gazeTravelY },
{ rotate: ${-torsionZ.value * 0.7}deg },
],
}));
const pupilParallaxX = isAvatar ? 2.8 : 16;
const pupilParallaxY = isAvatar ? 2.0 : 10;
const pupilAnimatedStyle = useAnimatedStyle(() => ({
transform: [
{ translateX: lookX.value * pupilParallaxX },
{ translateY: lookY.value * pupilParallaxY },
{ scale: animPupilScale.value * interpolate(speakPulse.value, ZERO_ONE, new Array(1, 1.14)) },
],
}));
const bottomLidAnimatedStyle = useAnimatedStyle(() => ({
transform: [
{ translateY: interpolate(animBottomLid.value, ZERO_ONE, new Array(isAvatar ? 16 : 98, isAvatar ? 5 : 34)) },
],
}));
const topLidAnimatedStyle = useAnimatedStyle(() => ({
transform: [
{ translateY: interpolate(animTopLid.value, ZERO_ONE, new Array(isAvatar ? -16 : -98, isAvatar ? -6 : -38)) },
],
}));
const mouthAnimatedStyle = useAnimatedStyle(() => ({
transform: [
{ scaleX: interpolate(mouthPulse.value, ZERO_ONE, new Array(0.85, 1.24)) },
{ scaleY: interpolate(mouthPulse.value, ZERO_ONE, new Array(0.85, 1.35)) },
],
}));
const baseEyeWidth = (isAvatar ? 18 : 114) * faceStyle.eyeWidthScale;
const baseEyeHeight = (isAvatar ? 16 : 102) * faceStyle.eyeHeightScale;
const eyeGap = (isAvatar ? 15 : 82) * faceStyle.eyeGapScale;
const renderedMouth = face.mouth !== "none" || voiceState === "sleeping" ? face.mouth : faceStyle.idleMouth;
const renderedMouthWidth = face.mouth !== "none" ? face.mouthWidth : faceStyle.idleMouthWidth;
const renderEye = (key: "left" | "right", offsetY: number, rotation: number) => {
const styleRotation = key === "left" ? faceStyle.leftEyeRotationOffset : faceStyle.rightEyeRotationOffset;
const motionStyle = key === "left" ? leftEyeMotionStyle : rightEyeMotionStyle;
const pupilSize = Math.min(baseEyeWidth, baseEyeHeight) * 0.56;
const mainHighlight = pupilSize * 0.34;
const subHighlight = pupilSize * 0.16;
return (
<View
key={key}
style={{
width: baseEyeWidth,
height: baseEyeHeight,
transform: [{ translateY: offsetY }, { rotate: ${rotation + styleRotation}deg }],
}}
>
<Animated.View
style={[
styles.eyeMotion,
isAvatar && styles.avatarEyeMotion,
motionStyle,
{ width: baseEyeWidth, height: baseEyeHeight },
]}
>
<View
style={[
styles.eyeShadow,
isAvatar && styles.avatarEyeShadow,
{
width: baseEyeWidth,
height: baseEyeHeight,
backgroundColor: palette.eyeShadowColor,
borderRadius: faceStyle.eyeRadius,
},
]}
/>
<View
style={[
styles.eye,
isAvatar && styles.avatarEye,
{
width: baseEyeWidth,
height: baseEyeHeight,
backgroundColor: palette.eyeColor,
borderRadius: faceStyle.eyeRadius,
borderWidth: isAvatar ? 1 : 3,
borderColor: palette.accentColor,
boxShadow: ${isAvatar ? "0 0 8px" : "0 0 28px"} ${palette.eyeGlow},
},
]}
>
<Animated.View
style={[
styles.pupilCore,
pupilAnimatedStyle,
{
width: pupilSize,
height: pupilSize,
borderRadius: 999,
backgroundColor: "rgba(4, 14, 28, 0.74)",
borderWidth: isAvatar ? 0.8 : 2,
borderColor: palette.accentColor,
},
]}
>
<View
style={{
position: "absolute",
top: pupilSize * 0.16,
left: pupilSize * 0.18,
width: mainHighlight,
height: mainHighlight,
borderRadius: 999,
backgroundColor: "#FFFFFF",
opacity: 0.96,
}}
/>
<View
style={{
position: "absolute",
bottom: pupilSize * 0.2,
right: pupilSize * 0.22,
width: subHighlight,
height: subHighlight,
borderRadius: 999,
backgroundColor: "#FFFFFF",
opacity: 0.78,
}}
/>
</Animated.View>
<Animated.View
pointerEvents="none"
style={[
styles.eyelidTop,
topLidAnimatedStyle,
{
width: baseEyeWidth * 1.2,
height: baseEyeHeight * 0.75,
backgroundColor: looiTheme.bg,
},
]}
/>
<Animated.View
pointerEvents="none"
style={[
styles.eyelidBottom,
bottomLidAnimatedStyle,
{
width: baseEyeWidth * 1.25,
height: baseEyeHeight * 0.8,
borderTopLeftRadius: baseEyeWidth,
borderTopRightRadius: baseEyeWidth,
backgroundColor: looiTheme.bg,
},
]}
/>

</Animated.View>

);
};
const content = (
<View style={[styles.wrap, isAvatar ? styles.avatarWrap : styles.fullscreenWrap]}>
{faceStyle.decor === "fringe" ? (
<View pointerEvents="none" style={[styles.capDecor, isAvatar && styles.avatarCapDecor]}>
<View style={[styles.capCrown, isAvatar && styles.avatarCapCrown, { backgroundColor: palette.accentColor, borderColor: palette.eyeShadowColor }]} />
<View style={[styles.capBrim, isAvatar && styles.avatarCapBrim, { backgroundColor: palette.eyeShadowColor }]} />

) : null}
{faceStyle.decor === "cowboy" ? (
<View pointerEvents="none" style={[styles.cowboyDecor, isAvatar && styles.avatarCowboyDecor]}>
<View style={[styles.cowboyCrown, isAvatar && styles.avatarCowboyCrown, { backgroundColor: palette.accentColor, borderColor: palette.eyeShadowColor }]}>
<View style={[styles.cowboyBand, isAvatar && styles.avatarCowboyBand, { backgroundColor: palette.eyeShadowColor }]} />

<View style={[styles.cowboyBrim, isAvatar && styles.avatarCowboyBrim, { backgroundColor: palette.accentColor, borderColor: palette.eyeShadowColor }]} />

) : null}
{faceStyle.decor === "bandana" ? (
<View pointerEvents="none" style={[styles.bandanaDecor, isAvatar && styles.avatarBandanaDecor]}>
<View style={[styles.bandanaBand, isAvatar && styles.avatarBandanaBand, { backgroundColor: palette.accentColor, borderColor: palette.eyeShadowColor }]} />
<View style={[styles.bandanaTail, styles.bandanaTailOne, isAvatar && styles.avatarBandanaTail, isAvatar && styles.avatarBandanaTailOne, { backgroundColor: palette.eyeShadowColor }]} />
<View style={[styles.bandanaTail, styles.bandanaTailTwo, isAvatar && styles.avatarBandanaTail, isAvatar && styles.avatarBandanaTailTwo, { backgroundColor: palette.accentColor }]} />

) : null}
{faceStyle.decor === "brows" ? (
<View pointerEvents="none" style={[styles.browRow, isAvatar && styles.avatarBrowRow, { gap: eyeGap + (isAvatar ? 9 : 58) }]}>
<View style={[styles.brow, isAvatar && styles.avatarBrow, { backgroundColor: palette.accentColor, transform: [{ rotate: "-10deg" }] }]} />
<View style={[styles.brow, isAvatar && styles.avatarBrow, { backgroundColor: palette.accentColor, transform: [{ rotate: "10deg" }] }]} />

) : null}
<View style={[styles.eyeRow, isAvatar && styles.avatarEyeRow, { gap: eyeGap }]}>
{renderEye("left", face.leftEyeOffsetY, face.leftEyeRotation)}
{renderEye("right", face.rightEyeOffsetY, face.rightEyeRotation)}
{faceStyle.decor === "lashes" ? (
<View pointerEvents="none" style={[styles.lashRow, isAvatar && styles.avatarLashRow, { gap: eyeGap + (isAvatar ? 21 : 102) }]}>
<View style={[styles.lash, isAvatar && styles.avatarLash, { backgroundColor: palette.accentColor, transform: [{ rotate: "-28deg" }] }]} />
<View style={[styles.lash, isAvatar && styles.avatarLash, { backgroundColor: palette.accentColor, transform: [{ rotate: "28deg" }] }]} />

) : null}
{renderedMouth !== "none" ? (
<Animated.View
style={[
styles.mouth,
isAvatar && styles.avatarMouth,
renderedMouth === "dot" && [styles.dotMouth, isAvatar && styles.avatarDotMouth],
renderedMouth === "smile" && styles.smileMouth,
mouthAnimatedStyle,
{
width: (isAvatar ? Math.max(6, Math.round(renderedMouthWidth * 0.28)) : renderedMouthWidth) * faceStyle.mouthWidthScale,
backgroundColor: renderedMouth === "smile" ? "transparent" : palette.mouthColor,
borderBottomColor: palette.mouthColor,
},
]}
/>
) : null}
{labelVisible ? (
<View style={[styles.caption, isAvatar && styles.avatarCaption]}>
) : null}

);
if (!onPress && !onLongPress) return content;
return (
<Pressable
accessibilityRole="button"
accessibilityHint={t("face.accessibilityHint")}
onPressIn={() => {
longPressFired.current = false;
}}
onLongPress={() => {
longPressFired.current = true;
onLongPress?.();
}}
delayLongPress={520}
onPress={() => {
if (!longPressFired.current) onPress?.();
}}
style={styles.pressable}
>
{content}

);
}
function inferSpeakingMood(text: string): FaceMood {
const normalized = text.toLowerCase();
if (!normalized.trim()) return "neutral";
if (/(?:harika|süper|muhteşem|mükemmel|yaşasın|vay|ура|круто|супер|отличн|здорово|клас|wow|awesome|great|amazing|yay)/i.test(normalized) || /!{2,}/.test(normalized)) {
return "excited";
}
if (/(?:üzgünüm|kusura|özür|dikkat|maalesef|kötü|жаль|извини|прости|осторож|неприят|плохо|sorry|careful|unfortunately)/i.test(normalized)) {
return "concerned";
}
if (/(?:acaba|belki|merak|düşünüyorum|nasıl|nedir|интерес|думаю|может быть|hmm|maybe|wonder)/i.test(normalized) || normalized.includes("?")) {
return "curious";
}
if (/(?:mutlu|memnun|güzel|seviyorum|iyi|harikasın|рад|приятно|хорош|люблю|happy|glad|nice)/i.test(normalized)) {
return "happy";
}
return "neutral";
}
function getCharacterFace(mood: CharacterMood): FaceVisual {
switch (mood) {
case "startled":
return {
leftEyeScaleX: 1.15, leftEyeScaleY: 1.18, rightEyeScaleX: 1.15, rightEyeScaleY: 1.18,
leftEyeOffsetY: -3, rightEyeOffsetY: -3, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 1.22, bottomLidLift: 0, topLidDrop: 0,
mouth: "dot", mouthWidth: 16,
};
case "pleased":
return {
leftEyeScaleX: 1.06, leftEyeScaleY: 0.88, rightEyeScaleX: 1.06, rightEyeScaleY: 0.88,
leftEyeOffsetY: 2, rightEyeOffsetY: 2, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 1.08, bottomLidLift: 0.85, topLidDrop: 0,
mouth: "smile", mouthWidth: 38,
};
case "annoyed":
return {
leftEyeScaleX: 1.02, leftEyeScaleY: 0.72, rightEyeScaleX: 0.94, rightEyeScaleY: 0.66,
leftEyeOffsetY: 4, rightEyeOffsetY: 5, leftEyeRotation: -5, rightEyeRotation: 5,
pupilScale: 0.88, bottomLidLift: 0, topLidDrop: 0.55,
mouth: "line", mouthWidth: 24,
};
case "angry":
return {
leftEyeScaleX: 1.06, leftEyeScaleY: 0.64, rightEyeScaleX: 1.06, rightEyeScaleY: 0.64,
leftEyeOffsetY: 5, rightEyeOffsetY: 5, leftEyeRotation: 11, rightEyeRotation: -11,
pupilScale: 0.82, bottomLidLift: 0.15, topLidDrop: 0.72,
mouth: "line", mouthWidth: 34,
};
case "victory":
return {
leftEyeScaleX: 1.12, leftEyeScaleY: 0.94, rightEyeScaleX: 1.12, rightEyeScaleY: 0.94,
leftEyeOffsetY: -2, rightEyeOffsetY: -2, leftEyeRotation: -3, rightEyeRotation: 3,
pupilScale: 1.16, bottomLidLift: 0.9, topLidDrop: 0,
mouth: "smile", mouthWidth: 42,
};
}
}
function getFaceForState(voiceState: VoiceState, streamingText: string, characterMood: CharacterMood | null): FaceVisual {
if (characterMood) return getCharacterFace(characterMood);
if (voiceState === "speaking") {
const mood = inferSpeakingMood(streamingText);
if (mood === "excited") {
return {
leftEyeScaleX: 1.1, leftEyeScaleY: 1.08, rightEyeScaleX: 1.1, rightEyeScaleY: 1.08,
leftEyeOffsetY: -2, rightEyeOffsetY: -2, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 1.18, bottomLidLift: 0.75, topLidDrop: 0,
mouth: "smile", mouthWidth: 36,
};
}
if (mood === "curious") {
return {
leftEyeScaleX: 1.08, leftEyeScaleY: 1.06, rightEyeScaleX: 0.92, rightEyeScaleY: 0.9,
leftEyeOffsetY: -4, rightEyeOffsetY: 3, leftEyeRotation: -3, rightEyeRotation: 3,
pupilScale: 1.12, bottomLidLift: 0, topLidDrop: 0,
mouth: "dot", mouthWidth: 14,
};
}
if (mood === "concerned") {
return {
leftEyeScaleX: 1, leftEyeScaleY: 0.86, rightEyeScaleX: 1, rightEyeScaleY: 0.86,
leftEyeOffsetY: 3, rightEyeOffsetY: 3, leftEyeRotation: -4, rightEyeRotation: 4,
pupilScale: 0.92, bottomLidLift: 0, topLidDrop: 0.35,
mouth: "line", mouthWidth: 24,
};
}
return {
leftEyeScaleX: 1.04, leftEyeScaleY: mood === "happy" ? 0.96 : 1.02,
rightEyeScaleX: 1.04, rightEyeScaleY: mood === "happy" ? 0.96 : 1.02,
leftEyeOffsetY: 0, rightEyeOffsetY: 0, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 1.08, bottomLidLift: mood === "happy" ? 0.72 : 0.25, topLidDrop: 0,
mouth: mood === "happy" ? "smile" : "line",
mouthWidth: mood === "happy" ? 34 : 28,
};
}
switch (voiceState) {
case "attention":
return {
leftEyeScaleX: 1.1, leftEyeScaleY: 1.1, rightEyeScaleX: 1.1, rightEyeScaleY: 1.1,
leftEyeOffsetY: -2, rightEyeOffsetY: -2, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 1.15, bottomLidLift: 0, topLidDrop: 0,
mouth: "none", mouthWidth: 0,
};
case "listening":
return {
leftEyeScaleX: 1.08, leftEyeScaleY: 1.08, rightEyeScaleX: 1.08, rightEyeScaleY: 1.08,
leftEyeOffsetY: -2, rightEyeOffsetY: -2, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 1.16, bottomLidLift: 0.18, topLidDrop: 0,
mouth: "smile", mouthWidth: 22,
};
case "processing":
return {
leftEyeScaleX: 0.98, leftEyeScaleY: 0.84, rightEyeScaleX: 0.98, rightEyeScaleY: 0.84,
leftEyeOffsetY: 2, rightEyeOffsetY: 2, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 0.9, bottomLidLift: 0, topLidDrop: 0.32,
mouth: "dot", mouthWidth: 10,
};
case "verifying":
return {
leftEyeScaleX: 1, leftEyeScaleY: 0.92, rightEyeScaleX: 1, rightEyeScaleY: 0.92,
leftEyeOffsetY: 0, rightEyeOffsetY: 0, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 1, bottomLidLift: 0, topLidDrop: 0,
mouth: "line", mouthWidth: 18,
};
case "sleeping":
return {
leftEyeScaleX: 1.08, leftEyeScaleY: 0.14, rightEyeScaleX: 1.08, rightEyeScaleY: 0.14,
leftEyeOffsetY: 2, rightEyeOffsetY: 2, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 0.7, bottomLidLift: 0.5, topLidDrop: 0.5,
mouth: "none", mouthWidth: 0,
};
default:
return {
leftEyeScaleX: 1, leftEyeScaleY: 1, rightEyeScaleX: 1, rightEyeScaleY: 1,
leftEyeOffsetY: 0, rightEyeOffsetY: 0, leftEyeRotation: 0, rightEyeRotation: 0,
pupilScale: 1, bottomLidLift: 0.12, topLidDrop: 0,
mouth: "smile", mouthWidth: 24,
};
}
}
const styles = StyleSheet.create({
pressable: {
alignItems: "center",
justifyContent: "center",
},
wrap: {
alignItems: "center",
justifyContent: "center",
position: "relative",
},
capDecor: { position: "absolute", top: 31, width: 220, height: 72, alignItems: "center", zIndex: 4 },
avatarCapDecor: { top: 8, width: 56, height: 19 },
capCrown: { width: 150, height: 50, borderTopLeftRadius: 48, borderTopRightRadius: 48, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, borderWidth: 3, opacity: 0.96 },
avatarCapCrown: { width: 38, height: 13, borderWidth: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
capBrim: { position: "absolute", bottom: 7, width: 176, height: 12, borderRadius: 999, transform: [{ rotate: "-4deg" }], opacity: 0.96 },
avatarCapBrim: { bottom: 2, width: 45, height: 3 },
cowboyDecor: { position: "absolute", top: 20, width: 270, height: 82, alignItems: "center", zIndex: 4 },
avatarCowboyDecor: { top: 5, width: 68, height: 22 },
cowboyCrown: { width: 126, height: 58, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderWidth: 3, overflow: "hidden", alignItems: "center", justifyContent: "flex-end", opacity: 0.96 },
avatarCowboyCrown: { width: 32, height: 15, borderWidth: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
cowboyBand: { width: "100%", height: 12, opacity: 0.95 },
avatarCowboyBand: { height: 3 },
cowboyBrim: { position: "absolute", bottom: 5, width: 248, height: 15, borderRadius: 999, borderWidth: 2, opacity: 0.96 },
avatarCowboyBrim: { bottom: 1, width: 62, height: 4, borderWidth: 1 },
bandanaDecor: { position: "absolute", top: 53, width: 238, height: 48, alignItems: "center", zIndex: 4 },
avatarBandanaDecor: { top: 14, width: 60, height: 13 },
bandanaBand: { width: 210, height: 22, borderRadius: 8, borderWidth: 2, opacity: 0.95 },
avatarBandanaBand: { width: 53, height: 6, borderRadius: 2, borderWidth: 1 },
bandanaTail: { position: "absolute", right: 2, top: 16, width: 42, height: 14, borderRadius: 6, opacity: 0.92 },
bandanaTailOne: { transform: [{ rotate: "28deg" }] },
bandanaTailTwo: { top: 26, right: 9, transform: [{ rotate: "52deg" }] },
avatarBandanaTail: { width: 11, height: 4, borderRadius: 2 },
avatarBandanaTailOne: { right: 1, top: 4 },
avatarBandanaTailTwo: { right: 2, top: 7 },
browRow: {
position: "absolute",
top: 72,
flexDirection: "row",
zIndex: 2,
},
avatarBrowRow: { top: 20 },
brow: { width: 44, height: 7, borderRadius: 999, opacity: 0.78 },
avatarBrow: { width: 10, height: 2 },
lashRow: {
position: "absolute",
top: 96,
flexDirection: "row",
zIndex: 3,
},
avatarLashRow: { top: 27 },
lash: { width: 22, height: 6, borderRadius: 999, opacity: 0.9 },
avatarLash: { width: 5, height: 2 },
fullscreenWrap: {
width: "100%",
minHeight: 340,
},
avatarWrap: {
width: 92,
height: 92,
},
eyeRow: {
minHeight: 120,
flexDirection: "row",
alignItems: "center",
justifyContent: "center",
},
avatarEyeRow: {
minHeight: 32,
},
eyeMotion: {
alignItems: "center",
justifyContent: "center",
},
avatarEyeMotion: {},
eyeShadow: {
position: "absolute",
left: 6,
top: 7,
borderRadius: 999,
opacity: 0.85,
},
avatarEyeShadow: {
left: 2,
top: 2,
opacity: 0.85,
},
eye: {
borderRadius: 999,
alignItems: "center",
justifyContent: "center",
overflow: "hidden",
},
avatarEye: {},
pupilCore: {
alignItems: "center",
justifyContent: "center",
},
eyelidTop: {
position: "absolute",
top: 0,
},
eyelidBottom: {
position: "absolute",
bottom: 0,
},
mouth: {
height: 5,
marginTop: 28,
borderRadius: 999,
opacity: 0.92,
},
avatarMouth: {
height: 2,
marginTop: 7,
},
dotMouth: {
height: 11,
borderRadius: 999,
},
avatarDotMouth: {
height: 3,
},
smileMouth: {
height: 14,
borderRadius: 999,
borderBottomWidth: 4,
borderBottomColor: "#54DCF2",
backgroundColor: "transparent",
},
caption: {
marginTop: 26,
paddingHorizontal: 16,
paddingVertical: 7,
borderRadius: 999,
borderWidth: 1,
borderColor: looiTheme.line,
backgroundColor: "rgba(3, 13, 24, 0.62)",
},
avatarCaption: {
marginTop: 4,
paddingHorizontal: 6,
paddingVertical: 2,
},
captionText: {
color: looiTheme.muted,
fontSize: 12,
fontWeight: "700",
},
avatarCaptionText: {
fontSize: 8,
},
});
