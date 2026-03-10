import {
	AbsoluteFill,
	Audio,
	Sequence,
	Video,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import React from 'react';
import segmentsData from './segments.json';
import config from './config.json';

const segments = segmentsData as { start: number, end: number, text: string }[];

const Caption: React.FC<{ text: string; start: number; end: number }> = ({ text, start, end }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const startFrame = Math.round(start * fps);
	const endFrame = Math.round(end * fps);

	if (frame < startFrame || frame >= endFrame) {
		return null;
	}

	return (
		<div
			style={{
				position: 'absolute',
				bottom: 80,
				width: '100%',
				textAlign: 'center',
				fontSize: 36,
				color: 'white',
				textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
				fontFamily: 'sans-serif',
				fontWeight: 'bold',
				padding: '0 40px',
				zIndex: 10,
			}}
		>
			<span style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '4px 12px', borderRadius: '8px' }}>
				{text}
			</span>
		</div>
	);
};

export const Main: React.FC = () => {
	const { fps } = useVideoConfig();

	return (
		<AbsoluteFill style={{ backgroundColor: 'black' }}>
			{/* Original Video Track - Unchanged, just muted */}
			<Video src={staticFile(config.videoSrc)} muted />

			{/* Audio and Captions Overlay */}
			{segments.map((segment, i) => {
				const nextStart = i < segments.length - 1 ? segments[i + 1].start : config.videoDuration;
				return (
					<div key={i}>
						<Sequence from={Math.round(segment.start * fps)}>
							<Audio src={staticFile(`vos_fixed/s${i}.mp3`)} />
						</Sequence>
						<Caption 
							text={segment.text} 
							start={segment.start} 
							end={nextStart} 
						/>
					</div>
				);
			})}
		</AbsoluteFill>
	);
};
