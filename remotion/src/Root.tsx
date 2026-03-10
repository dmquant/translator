import { Composition } from 'remotion';
import { Main } from './Composition';
import config from './config.json';

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition
				id="Main"
				component={Main}
				durationInFrames={config.durationInFrames}
				fps={config.fps}
				width={1280}
				height={720}
			/>
		</>
	);
};
