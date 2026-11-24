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
const ZERO_ONE: [number, number] =;

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

