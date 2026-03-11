'use client';

import { useRef, useEffect } from 'react';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let handLandmarker: HandLandmarker;
    let animationFrameId: number;

    // --- [게임 데이터 설정] ---
    // 여드름 상태 (x, y는 0~1 사이의 비율)
    let pimple = { x: 0.5, y: 0.5, size: 40, popped: false };
    // 터졌을 때 나올 파티클 저장소
    let particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];

    const setupHandDetection = async () => {
      // 1. MediaPipe 엔진 로드 (WASM)
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      // 2. 핸드 랜드마커 초기화
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });

      // 3. 카메라 연결
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startLoop();
        };
      }
    };

    const startLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const render = () => {
        // 캔버스 크기를 브라우저에 맞춤
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const results = handLandmarker.detectForVideo(video, performance.now());

        ctx.save();
        // 배경을 어둡게 처리 (영상 투명도 조절)
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 거울 모드 적용
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);

        // 4. 카메라 영상 그리기
        ctx.globalAlpha = 0.5;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;

        // 5. 여드름(타겟) 그리기
        if (!pimple.popped) {
          const px = pimple.x * canvas.width;
          const py = pimple.y * canvas.height;
          
          // 바깥 테두리 (부어오른 느낌)
          ctx.beginPath();
          ctx.arc(px, py, pimple.size, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 80, 80, 0.6)";
          ctx.fill();
          
          // 중심 (하얀 헤드)
          ctx.beginPath();
          ctx.arc(px, py, pimple.size * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.fill();
        }

        // 6. 손가락 추적 및 꼬집기(Pinch) 로직
        if (results.landmarks && results.landmarks[0]) {
          const landmarks = results.landmarks[0];
          const thumb = landmarks[4]; // 엄지 끝
          const index = landmarks[8]; // 검지 끝

          // 두 손가락 사이의 거리 계산
          const dist = Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2));
          
          // 꼬집기 좌표 (두 손가락의 정중앙)
          const pinchX = ((thumb.x + index.x) / 2) * canvas.width;
          const pinchY = ((thumb.y + index.y) / 2) * canvas.height;

          // 시각적 피드백: 꼬집는 위치 표시
          ctx.beginPath();
          ctx.arc(pinchX, pinchY, 15, 0, Math.PI * 2);
          ctx.strokeStyle = dist < 0.05 ? "#FFD700" : "#fff"; // 가까워지면 금색
          ctx.lineWidth = 3;
          ctx.stroke();

          // 7. 여드름 터뜨리기 판정
          if (dist < 0.05 && !pimple.popped) {
            const dx = pinchX - (pimple.x * canvas.width);
            const dy = pinchY - (pimple.y * canvas.height);
            const distToPimple = Math.sqrt(dx*dx + dy*dy);

            if (distToPimple < pimple.size) {
              pimple.popped = true;
              // 파티클(고름 효과) 생성
              for (let i = 0; i < 40; i++) {
                particles.push({
                  x: pinchX,
                  y: pinchY,
                  vx: (Math.random() - 0.5) * 15,
                  vy: (Math.random() - 0.5) * 15,
                  life: 1.0,
                  color: `hsl(${Math.random() * 20 + 40}, 100%, 70%)` // 연노란색 계열
                });
              }
            }
          }
        }

        // 8. 파티클 애니메이션 처리
        particles.forEach((p, i) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.5; // 중력 추가!
          p.life -= 0.02;

          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.life;
          ctx.fill();

          if (p.life <= 0) particles.splice(i, 1);
        });
        ctx.globalAlpha = 1.0;

        ctx.restore();
        animationFrameId = requestAnimationFrame(render);
      };
      render();
    };

    setupHandDetection();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <main style={{ width: '100vw', height: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </main>
  );
}