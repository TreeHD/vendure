import { Parent, ResolveField, Resolver } from '@nestjs/graphql';

/** Converts the database's safe text representation into the public JSON scalar. */
@Resolver('CmsArticle')
export class CmsArticleContentResolver {
    @ResolveField()
    content(@Parent() article: { content: string }) {
        return JSON.parse(article.content);
    }
}

@Resolver('CmsArticleTranslation')
export class CmsArticleTranslationContentResolver {
    @ResolveField()
    content(@Parent() translation: { content: string }) {
        return JSON.parse(translation.content);
    }
}
