package com.cloudflow.auth.utils;

import com.cloudflow.common.core.utils.SysConfigHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.GeneralPath;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Random;

/**
 * 滑块验证码工具类
 * <p>
 * 图片尺寸参数从 sys_config 表动态读取（全局配置）：
 * - sys.captcha.width（ID 36）：背景图宽度，默认 300
 * - sys.captcha.height（ID 37）：背景图高度，默认 150
 * - sys.captcha.puzzleSize（ID 38）：拼图块大小，默认 44
 * - sys.captcha.circleRadius（ID 39）：圆弧半径，默认 8
 *
 * @author CloudFlow
 */
@Slf4j
@Component
public class SliderPuzzleUtil {

    /** 默认值常量 */
    private static final int DEFAULT_WIDTH = 300;
    private static final int DEFAULT_HEIGHT = 150;
    private static final int DEFAULT_PUZZLE_SIZE = 44;
    private static final int DEFAULT_CIRCLE_R = 8;

    private static SysConfigHelper configHelper;

    @Autowired(required = false)
    public void setSysConfigHelper(SysConfigHelper helper) {
        SliderPuzzleUtil.configHelper = helper;
    }

    /** 获取背景图宽度 */
    private static int getWidth() {
        if (configHelper != null) {
            return configHelper.getGlobalInt("sys.captcha.width", DEFAULT_WIDTH);
        }
        return DEFAULT_WIDTH;
    }

    /** 获取背景图高度 */
    private static int getHeight() {
        if (configHelper != null) {
            return configHelper.getGlobalInt("sys.captcha.height", DEFAULT_HEIGHT);
        }
        return DEFAULT_HEIGHT;
    }

    /** 获取拼图块逻辑宽度 */
    private static int getPuzzleSize() {
        if (configHelper != null) {
            return configHelper.getGlobalInt("sys.captcha.puzzleSize", DEFAULT_PUZZLE_SIZE);
        }
        return DEFAULT_PUZZLE_SIZE;
    }

    /** 获取凸出圆弧半径 */
    private static int getCircleR() {
        if (configHelper != null) {
            return configHelper.getGlobalInt("sys.captcha.circleRadius", DEFAULT_CIRCLE_R);
        }
        return DEFAULT_CIRCLE_R;
    }

    private static Color alpha(Color color, int alpha) {
        return new Color(color.getRed(), color.getGreen(), color.getBlue(), alpha);
    }

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
     * 路径范围: x=[0, puzzleSize+circleR], y=[-circleR, puzzleSize]
     */
    private static GeneralPath createPuzzlePath(int puzzleSize, int circleR) {
        GeneralPath path = new GeneralPath();
        // 起点：左上角
        path.moveTo(0, 0);
        // 顶边 + 顶部凸出 tab
        path.lineTo(puzzleSize / 2.0 - circleR, 0);
        path.curveTo(
            puzzleSize / 2.0 - circleR, -circleR,
            puzzleSize / 2.0 + circleR, -circleR,
            puzzleSize / 2.0 + circleR, 0
        );
        path.lineTo(puzzleSize, 0);
        // 右边 + 右侧凸出 tab
        path.lineTo(puzzleSize, puzzleSize / 2.0 - circleR);
        path.curveTo(
            puzzleSize + circleR, puzzleSize / 2.0 - circleR,
            puzzleSize + circleR, puzzleSize / 2.0 + circleR,
            puzzleSize, puzzleSize / 2.0 + circleR
        );
        path.lineTo(puzzleSize, puzzleSize);
        // 底边
        path.lineTo(0, puzzleSize);
        // 左边 + 左侧凹入 tab
        path.lineTo(0, puzzleSize / 2.0 + circleR);
        path.curveTo(
            circleR, puzzleSize / 2.0 + circleR,
            circleR, puzzleSize / 2.0 - circleR,
            0, puzzleSize / 2.0 - circleR
        );
        path.closePath();
        return path;
    }

    private static void paintBackground(Graphics2D gBg, int width, int height, Random random) {
        Color topColor = new Color(54 + random.nextInt(28), 126 + random.nextInt(36), 144 + random.nextInt(28));
        Color bottomColor = new Color(69 + random.nextInt(32), 97 + random.nextInt(28), 126 + random.nextInt(34));
        GradientPaint gradient = new GradientPaint(0, 0, topColor, width, height, bottomColor);
        gBg.setPaint(gradient);
        gBg.fillRect(0, 0, width, height);

        Color[] palette = new Color[] {
            new Color(45, 212, 191),
            new Color(96, 165, 250),
            new Color(99, 102, 241),
            new Color(244, 114, 182),
            new Color(250, 204, 21)
        };

        for (int i = 0; i < 16; i++) {
            Color base = palette[random.nextInt(palette.length)];
            int radius = 14 + random.nextInt(34);
            gBg.setColor(alpha(base, 36 + random.nextInt(42)));
            gBg.fillOval(random.nextInt(width), random.nextInt(height), radius, radius);
        }

        for (int i = 0; i < 6; i++) {
            Color base = palette[random.nextInt(palette.length)];
            gBg.setColor(alpha(base, 38 + random.nextInt(24)));
            gBg.setStroke(new BasicStroke(1.2f + random.nextFloat() * 1.2f));
            gBg.drawLine(
                random.nextInt(width),
                random.nextInt(height),
                random.nextInt(width),
                random.nextInt(height)
            );
        }

        gBg.setPaint(new RadialGradientPaint(
            width * 0.22f,
            height * 0.24f,
            Math.max(width, height) * 0.52f,
            new float[] {0f, 1f},
            new Color[] {new Color(255, 255, 255, 110), new Color(255, 255, 255, 0)}
        ));
        gBg.fillRect(0, 0, width, height);
    }

    /**
     * 生成滑块验证码数据
     *
     * @return 包含背景图、滑块图、坐标等信息的验证码数据
     */
    public static CaptchaData createCaptcha() {
        // 从配置中读取尺寸参数
        int width = getWidth();
        int height = getHeight();
        int puzzleSize = getPuzzleSize();
        int circleR = getCircleR();
        int sliderImgWidth = puzzleSize + circleR;
        int sliderImgHeight = puzzleSize + circleR;

        CaptchaData data = new CaptchaData();
        Random random = new Random();

        // 1. 生成背景图
        BufferedImage bg = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D gBg = bg.createGraphics();
        gBg.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        paintBackground(gBg, width, height, random);

        // 2. 确定拼图位置
        int targetX = sliderImgWidth + random.nextInt(width - 2 * sliderImgWidth);
        int targetY = circleR + random.nextInt(height - puzzleSize - circleR * 2);

        // 存储验证用的 X 坐标
        data.setX(targetX);

        // 3. 创建拼图路径
        GeneralPath path = createPuzzlePath(puzzleSize, circleR);

        // 4. 创建滑块图片（带透明通道）
        BufferedImage slider = new BufferedImage(sliderImgWidth, sliderImgHeight, BufferedImage.TYPE_INT_ARGB);
        Graphics2D gSlider = slider.createGraphics();
        gSlider.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        // 将绘图原点下移 circleR，使顶部 tab（y=-circleR）映射到图片 y=0
        gSlider.translate(0, circleR);

        // 先绘制阴影，让滑块块体比目标缺口更显眼
        Graphics2D gSliderShadow = (Graphics2D) gSlider.create();
        gSliderShadow.translate(2, 2);
        gSliderShadow.setColor(new Color(15, 23, 42, 58));
        gSliderShadow.fill(path);
        gSliderShadow.dispose();

        // 用拼图路径裁剪
        gSlider.setClip(path);
        // 从背景图中提取对应区域
        gSlider.drawImage(bg, -targetX, -targetY, null);
        // 提升亮度，避免滑块与背景混在一起
        gSlider.setComposite(AlphaComposite.SrcAtop.derive(0.18f));
        gSlider.setPaint(new GradientPaint(
            0,
            -circleR,
            new Color(255, 255, 255, 220),
            sliderImgWidth,
            sliderImgHeight,
            new Color(255, 255, 255, 20)
        ));
        gSlider.fillRect(0, -circleR, sliderImgWidth, sliderImgHeight);
        gSlider.setComposite(AlphaComposite.SrcOver);

        // 绘制拼图块边框
        gSlider.setClip(null);
        gSlider.setColor(new Color(255, 255, 255, 245));
        gSlider.setStroke(new BasicStroke(2.0f));
        gSlider.draw(path);
        gSlider.setColor(new Color(94, 234, 212, 88));
        gSlider.setStroke(new BasicStroke(1.1f));
        gSlider.draw(path);

        gSlider.dispose();

        // 5. 在背景图上绘制缺口
        Graphics2D gBg2 = bg.createGraphics();
        gBg2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        Graphics2D gSlotShadow = (Graphics2D) gBg2.create();
        gSlotShadow.translate(targetX + 1, targetY + 1);
        gSlotShadow.setColor(new Color(15, 23, 42, 62));
        gSlotShadow.fill(path);
        gSlotShadow.dispose();

        Graphics2D gSlot = (Graphics2D) gBg2.create();
        gSlot.translate(targetX, targetY);
        // 弱化目标缺口，避免比滑块更显眼
        gSlot.setColor(new Color(255, 255, 255, 98));
        gSlot.fill(path);
        gSlot.setColor(new Color(255, 255, 255, 150));
        gSlot.setStroke(new BasicStroke(1.6f));
        gSlot.draw(path);
        gSlot.setColor(new Color(15, 23, 42, 28));
        gSlot.setStroke(new BasicStroke(1.0f));
        gSlot.draw(path);
        gSlot.dispose();

        gBg2.dispose();

        gBg.dispose();

        // 6. 前端需要的 Y 坐标（滑块图片的 top 位置）
        data.setY(targetY - circleR);
        data.setSliderWidth(sliderImgWidth);
        data.setSliderHeight(sliderImgHeight);

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
