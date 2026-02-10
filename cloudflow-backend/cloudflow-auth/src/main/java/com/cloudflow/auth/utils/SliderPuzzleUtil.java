package com.cloudflow.auth.utils;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.GeneralPath;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Random;

public class SliderPuzzleUtil {

    /** 背景图宽度 */
    private static final int WIDTH = 300;
    /** 背景图高度 */
    private static final int HEIGHT = 150;
    /** 拼图块逻辑宽度（不含凸出部分） */
    private static final int PUZZLE_SIZE = 44;
    /** 凸出圆弧半径 */
    private static final int CIRCLE_R = 8;
    /** 滑块图片实际宽度（含右侧凸出） */
    private static final int SLIDER_IMG_WIDTH = PUZZLE_SIZE + CIRCLE_R;
    /** 滑块图片实际高度（含顶部凸出） */
    private static final int SLIDER_IMG_HEIGHT = PUZZLE_SIZE + CIRCLE_R;

    public static class CaptchaData {
        private String bgImage;
        private String sliderImage;
        private int x;
        private int y;
        private int sliderWidth;
        private int sliderHeight;

        public String getBgImage() { return bgImage; }
        public void setBgImage(String bgImage) { this.bgImage = bgImage; }
        public String getSliderImage() { return sliderImage; }
        public void setSliderImage(String sliderImage) { this.sliderImage = sliderImage; }
        public int getX() { return x; }
        public void setX(int x) { this.x = x; }
        public int getY() { return y; }
        public void setY(int y) { this.y = y; }
        public int getSliderWidth() { return sliderWidth; }
        public void setSliderWidth(int sliderWidth) { this.sliderWidth = sliderWidth; }
        public int getSliderHeight() { return sliderHeight; }
        public void setSliderHeight(int sliderHeight) { this.sliderHeight = sliderHeight; }
    }

    /**
     * 创建拼图路径（相对于原点）
     * 路径范围: x=[0, PUZZLE_SIZE+CIRCLE_R], y=[-CIRCLE_R, PUZZLE_SIZE]
     */
    private static GeneralPath createPuzzlePath() {
        GeneralPath path = new GeneralPath();
        // 起点：左上角
        path.moveTo(0, 0);
        // 顶边 + 顶部凸出 tab
        path.lineTo(PUZZLE_SIZE / 2.0 - CIRCLE_R, 0);
        path.curveTo(
            PUZZLE_SIZE / 2.0 - CIRCLE_R, -CIRCLE_R,
            PUZZLE_SIZE / 2.0 + CIRCLE_R, -CIRCLE_R,
            PUZZLE_SIZE / 2.0 + CIRCLE_R, 0
        );
        path.lineTo(PUZZLE_SIZE, 0);
        // 右边 + 右侧凸出 tab
        path.lineTo(PUZZLE_SIZE, PUZZLE_SIZE / 2.0 - CIRCLE_R);
        path.curveTo(
            PUZZLE_SIZE + CIRCLE_R, PUZZLE_SIZE / 2.0 - CIRCLE_R,
            PUZZLE_SIZE + CIRCLE_R, PUZZLE_SIZE / 2.0 + CIRCLE_R,
            PUZZLE_SIZE, PUZZLE_SIZE / 2.0 + CIRCLE_R
        );
        path.lineTo(PUZZLE_SIZE, PUZZLE_SIZE);
        // 底边
        path.lineTo(0, PUZZLE_SIZE);
        // 左边 + 左侧凹入 tab
        path.lineTo(0, PUZZLE_SIZE / 2.0 + CIRCLE_R);
        path.curveTo(
            CIRCLE_R, PUZZLE_SIZE / 2.0 + CIRCLE_R,
            CIRCLE_R, PUZZLE_SIZE / 2.0 - CIRCLE_R,
            0, PUZZLE_SIZE / 2.0 - CIRCLE_R
        );
        path.closePath();
        return path;
    }

    public static CaptchaData createCaptcha() {
        CaptchaData data = new CaptchaData();
        Random random = new Random();

        // 1. 生成背景图
        BufferedImage bg = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D gBg = bg.createGraphics();
        gBg.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // 渐变背景
        Color c1 = new Color(30 + random.nextInt(100), 50 + random.nextInt(100), 80 + random.nextInt(150));
        Color c2 = new Color(30 + random.nextInt(100), 50 + random.nextInt(100), 80 + random.nextInt(150));
        GradientPaint gp = new GradientPaint(0, 0, c1, WIDTH, HEIGHT, c2);
        gBg.setPaint(gp);
        gBg.fillRect(0, 0, WIDTH, HEIGHT);

        // 添加噪点/装饰
        for (int i = 0; i < 20; i++) {
            gBg.setColor(new Color(random.nextInt(255), random.nextInt(255), random.nextInt(255), 80));
            int r = 10 + random.nextInt(40);
            gBg.fillOval(random.nextInt(WIDTH), random.nextInt(HEIGHT), r, r);
        }
        // 添加一些线条增加复杂度
        for (int i = 0; i < 5; i++) {
            gBg.setColor(new Color(random.nextInt(255), random.nextInt(255), random.nextInt(255), 60));
            gBg.setStroke(new BasicStroke(1 + random.nextInt(2)));
            gBg.drawLine(random.nextInt(WIDTH), random.nextInt(HEIGHT), random.nextInt(WIDTH), random.nextInt(HEIGHT));
        }

        // 2. 确定拼图位置
        // targetX: 拼图块左上角的 x 坐标（确保不会太靠左或太靠右）
        // targetY: 拼图块左上角的 y 坐标（确保顶部 tab 和底部都在图片内）
        int targetX = SLIDER_IMG_WIDTH + random.nextInt(WIDTH - 2 * SLIDER_IMG_WIDTH);
        int targetY = CIRCLE_R + random.nextInt(HEIGHT - PUZZLE_SIZE - CIRCLE_R * 2);

        // 存储验证用的 X 坐标
        data.setX(targetX);

        // 3. 创建拼图路径
        GeneralPath path = createPuzzlePath();

        // 4. 创建滑块图片（带透明通道）
        // 图片尺寸需要容纳完整的拼图形状（包括凸出部分）
        BufferedImage slider = new BufferedImage(SLIDER_IMG_WIDTH, SLIDER_IMG_HEIGHT, BufferedImage.TYPE_INT_ARGB);
        Graphics2D gSlider = slider.createGraphics();
        gSlider.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // 将绘图原点下移 CIRCLE_R，使顶部 tab（y=-CIRCLE_R）映射到图片 y=0
        gSlider.translate(0, CIRCLE_R);

        // 用拼图路径裁剪
        gSlider.setClip(path);
        // 从背景图中提取对应区域
        gSlider.drawImage(bg, -targetX, -targetY, null);

        // 绘制拼图块边框（白色半透明）
        gSlider.setClip(null);
        gSlider.setColor(new Color(255, 255, 255, 220));
        gSlider.setStroke(new BasicStroke(2.0f));
        gSlider.draw(path);

        // 添加内阴影效果
        gSlider.setColor(new Color(0, 0, 0, 40));
        gSlider.setStroke(new BasicStroke(1.0f));
        gSlider.draw(path);

        gSlider.dispose();

        // 5. 在背景图上绘制缺口
        Graphics2D gBg2 = bg.createGraphics();
        gBg2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        // 移动到目标位置
        gBg2.translate(targetX, targetY);
        // 半透明黑色填充缺口
        gBg2.setColor(new Color(0, 0, 0, 160));
        gBg2.fill(path);
        // 缺口边框
        gBg2.setColor(new Color(255, 255, 255, 80));
        gBg2.setStroke(new BasicStroke(1.5f));
        gBg2.draw(path);
        gBg2.dispose();

        gBg.dispose();

        // 6. 前端需要的 Y 坐标（滑块图片的 top 位置）
        // 因为滑块图片中路径向下偏移了 CIRCLE_R，所以前端 Y 需要减去 CIRCLE_R
        data.setY(targetY - CIRCLE_R);
        data.setSliderWidth(SLIDER_IMG_WIDTH);
        data.setSliderHeight(SLIDER_IMG_HEIGHT);

        // 7. 编码为 Base64
        try {
            data.setBgImage(toBase64(bg));
            data.setSliderImage(toBase64(slider));
        } catch (IOException e) {
            throw new RuntimeException("验证码图片生成失败", e);
        }

        return data;
    }

    private static String toBase64(BufferedImage image) throws IOException {
        ByteArrayOutputStream os = new ByteArrayOutputStream();
        ImageIO.write(image, "png", os);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(os.toByteArray());
    }
}
